import "server-only";
import type { NextRequest } from "next/server";
import { Errors } from "./errors";
import { config } from "./config";
import { idempotencyKey } from "./schemas";

/** Reads a raw upload body, aborting as soon as it exceeds the limit (no unbounded buffering). */
export async function readUpload(req: NextRequest, max = config().PHOTO_MAX_UPLOAD_BYTES): Promise<{ data: Buffer; key: string }> {
  const ct = req.headers.get("content-type") ?? "";
  if (!/^image\/(jpeg|png|webp)$/.test(ct.split(";")[0]!.trim())) throw Errors.unsupported("Upload a JPEG, PNG or WebP photo.");
  const declared = Number(req.headers.get("content-length") ?? "0");
  if (declared > max) throw Errors.tooLarge();
  const key = idempotencyKey.safeParse(req.headers.get("idempotency-key"));
  if (!key.success) throw Errors.badRequest("Missing or invalid Idempotency-Key header.");
  if (!req.body) throw Errors.badRequest("Empty upload.");
  const reader = req.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > max) {
      await reader.cancel().catch(() => {});
      throw Errors.tooLarge();
    }
    chunks.push(value);
  }
  if (total === 0) throw Errors.badRequest("Empty upload.");
  return { data: Buffer.concat(chunks), key: key.data };
}
