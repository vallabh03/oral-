import "server-only";
import crypto from "node:crypto";

/** Verifies Meta's X-Hub-Signature-256 HMAC over the raw request body (FR-OPS-06). */
export function verifyWebhookSignature(raw: string, header: string | null, secret: string): boolean {
  if (!header?.startsWith("sha256=")) return false;
  const expected = "sha256=" + crypto.createHmac("sha256", secret).update(raw).digest("hex");
  return header.length === expected.length && crypto.timingSafeEqual(Buffer.from(header), Buffer.from(expected));
}
