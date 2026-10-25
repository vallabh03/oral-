"use client";

export type ApiError = Error & { status: number; code: string; fields?: Record<string, string>; retryAfter?: number };

export function newKey(): string {
  return (crypto.randomUUID?.() ?? `${Date.now()}-${Math.random()}`).replace(/[^A-Za-z0-9_-]/g, "") + "k";
}

function csrfToken(): string {
  return document.querySelector<HTMLMetaElement>('meta[name="csrf-token"]')?.content ?? sessionStorage.getItem("pending-csrf") ?? "";
}

async function parse(res: Response) {
  if (res.status === 204) return null;
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    const err = new Error(data?.error?.message ?? (res.status >= 500 ? "Something went wrong on our side. Please try again." : "The request could not be completed.")) as ApiError;
    err.status = res.status;
    err.code = data?.error?.code ?? "error";
    err.fields = data?.error?.fields;
    err.retryAfter = Number(res.headers.get("retry-after")) || undefined;
    throw err;
  }
  return data;
}

function networkError(): ApiError {
  const err = new Error("You appear to be offline or the connection dropped. Check your connection and try again.") as ApiError;
  err.status = 0;
  err.code = "network";
  return err;
}

export async function getJson<T = unknown>(url: string): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, { headers: { accept: "application/json" }, credentials: "same-origin" });
  } catch {
    throw networkError();
  }
  return parse(res) as Promise<T>;
}

export async function sendJson<T = unknown>(method: "POST" | "PATCH" | "DELETE", url: string, body: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, { method, credentials: "same-origin", headers: { "content-type": "application/json", accept: "application/json", "x-csrf-token": csrfToken() }, body: JSON.stringify(body) });
  } catch {
    throw networkError();
  }
  return parse(res) as Promise<T>;
}

export const postJson = <T = unknown>(url: string, body: unknown) => sendJson<T>("POST", url, body);

/**
 * Uploads an image with retry + exponential backoff. The same idempotency key is reused across
 * retries, so a retry after a dropped response can never create a duplicate photo.
 */
export async function uploadImage(url: string, blob: Blob, key: string, onProgress?: (pct: number) => void, attempts = 4): Promise<{ id: string }> {
  for (let i = 0; ; i++) {
    try {
      return await new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open("POST", url);
        xhr.setRequestHeader("content-type", blob.type || "image/jpeg");
        xhr.setRequestHeader("idempotency-key", key);
        xhr.setRequestHeader("x-csrf-token", csrfToken());
        xhr.timeout = 60_000;
        xhr.upload.onprogress = (e) => e.lengthComputable && onProgress?.(Math.round((e.loaded / e.total) * 100));
        xhr.onload = () => {
          let data: { error?: { message?: string; code?: string } } | null = null;
          try { data = JSON.parse(xhr.responseText); } catch {}
          if (xhr.status >= 200 && xhr.status < 300) return resolve(data as { id: string });
          const err = new Error(data?.error?.message ?? "Upload failed.") as ApiError;
          err.status = xhr.status;
          err.code = data?.error?.code ?? "error";
          err.retryAfter = Number(xhr.getResponseHeader("retry-after")) || undefined;
          reject(err);
        };
        xhr.onerror = () => reject(networkError());
        xhr.ontimeout = () => reject(networkError());
        xhr.send(blob);
      });
    } catch (e) {
      const err = e as ApiError;
      const retryable = err.status === 0 || err.status === 503 || err.status === 429 || err.status >= 500;
      if (!retryable || i >= attempts - 1) throw err;
      const wait = (err.retryAfter ? err.retryAfter * 1000 : 0) || Math.min(8000, 500 * 2 ** i) + Math.random() * 300;
      await new Promise((r) => setTimeout(r, wait));
    }
  }
}
