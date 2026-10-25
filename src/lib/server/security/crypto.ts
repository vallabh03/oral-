import "server-only";
import crypto from "node:crypto";
import { config } from "../config";

/** 256-bit URL-safe random token. */
export function randomToken(bytes = 32): string {
  return crypto.randomBytes(bytes).toString("base64url");
}

export function sha256(input: string | Buffer): string {
  return crypto.createHash("sha256").update(input).digest("hex");
}

/** Keyed hash for tokens at rest (so a DB leak alone cannot be replayed against hashes). */
export function hashToken(token: string): string {
  return crypto.createHmac("sha256", config().auditSecret).update("token:" + token).digest("hex");
}

export function hmac(data: string, secret = config().auditSecret): string {
  return crypto.createHmac("sha256", secret).update(data).digest("hex");
}

export function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && crypto.timingSafeEqual(ab, bb);
}

function dataKey(): Buffer {
  return crypto.createHash("sha256").update("enc:" + config().dataKey).digest();
}

/** AES-256-GCM for small secrets at rest (e.g. TOTP seeds). Output: v1.iv.tag.ciphertext */
export function encryptSecret(plain: string): string {
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv("aes-256-gcm", dataKey(), iv);
  const ct = Buffer.concat([c.update(plain, "utf8"), c.final()]);
  return ["v1", iv.toString("base64url"), c.getAuthTag().toString("base64url"), ct.toString("base64url")].join(".");
}

export function decryptSecret(enc: string): string {
  const [v, iv, tag, ct] = enc.split(".");
  if (v !== "v1" || !iv || !tag || !ct) throw new Error("bad ciphertext");
  const d = crypto.createDecipheriv("aes-256-gcm", dataKey(), Buffer.from(iv, "base64url"));
  d.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([d.update(Buffer.from(ct, "base64url")), d.final()]).toString("utf8");
}

export function hashIp(ip: string | null): string {
  return hmac("ip:" + (ip ?? "unknown")).slice(0, 32);
}
