import { NextResponse, type NextRequest } from "next/server";

// Per-request nonce-based Content-Security-Policy, plus noindex on private surfaces.
export function proxy(req: NextRequest) {
  const nonce = btoa(crypto.randomUUID());
  const dev = process.env.NODE_ENV !== "production";
  const csp = [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${dev ? " 'unsafe-eval'" : ""}`,
    "style-src 'self' 'unsafe-inline'",
    `img-src 'self' data: blob:${[process.env.S3_BUCKET, process.env.CLINICAL_S3_BUCKET].filter(Boolean).map((b) => ` https://${b}.s3.${process.env.AWS_REGION ?? "ap-south-2"}.amazonaws.com`).join("")}`,
    "font-src 'self'",
    `connect-src 'self'${process.env.STORAGE_DRIVER === "s3" && process.env.CLINICAL_S3_BUCKET ? ` https://${process.env.CLINICAL_S3_BUCKET}.s3.${process.env.AWS_REGION ?? "ap-south-2"}.amazonaws.com` : ""}`,
    "media-src 'self' blob:",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    "manifest-src 'self'",
    "worker-src 'self' blob:",
    ...(dev ? [] : ["upgrade-insecure-requests"]),
  ].join("; ");

  const headers = new Headers(req.headers);
  headers.set("x-nonce", nonce);
  headers.set("content-security-policy", csp);
  const res = NextResponse.next({ request: { headers } });
  res.headers.set("content-security-policy", csp);

  const p = req.nextUrl.pathname;
  if (process.env.INDEXING_ENABLED !== "true") res.headers.set("x-robots-tag", "noindex, nofollow");
  if (p.startsWith("/workspace") || p.startsWith("/register") || p.startsWith("/api")) {
    res.headers.set("x-robots-tag", "noindex, nofollow, noarchive");
    if (!p.startsWith("/api/photos")) res.headers.set("cache-control", "no-store");
  }
  return res;
}

export const config = {
  matcher: [{ source: "/((?!_next/static|_next/image|favicon.ico|icon|apple-icon|images/|fonts/).*)" }],
};
