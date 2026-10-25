import { describe, expect, it } from "vitest";
import { base32Decode, base32Encode, hotp, totp, verifyTotp } from "@/lib/server/security/totp";
import { decryptSecret, encryptSecret, hashToken, randomToken, safeEqual } from "@/lib/server/security/crypto";
import { hashPassword, passwordPolicyError, verifyPassword } from "@/lib/server/security/password";
import { redact } from "@/lib/server/audit";
import { headerSafe } from "@/lib/server/email";
import { verifyWebhookSignature } from "@/lib/server/webhook";
import crypto from "node:crypto";

describe("TOTP (RFC 6238)", () => {
  const secret = base32Encode(Buffer.from("12345678901234567890"));
  it("matches the RFC test vector", () => {
    expect(totp(secret, 59_000)).toBe("287082");
    expect(hotp(secret, 1)).toBe("287082");
    expect(totp(secret, 1111111109_000)).toBe("081804");
  });
  it("round-trips base32", () => {
    expect(base32Decode(secret).toString()).toBe("12345678901234567890");
  });
  it("accepts ±1 step and rejects replays and malformed codes", () => {
    const now = 1_700_000_000_000;
    const code = totp(secret, now - 30_000);
    const step = verifyTotp(secret, code, null, now);
    expect(step).not.toBeNull();
    expect(verifyTotp(secret, code, step, now)).toBeNull();
    expect(verifyTotp(secret, "12345", null, now)).toBeNull();
    expect(verifyTotp(secret, totp(secret, now - 120_000), null, now)).toBeNull();
  });
});

describe("crypto helpers", () => {
  it("generates 256-bit URL-safe tokens", () => {
    const t = randomToken();
    expect(t).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(randomToken()).not.toBe(t);
  });
  it("hashes tokens deterministically with a key (never stores plaintext)", () => {
    expect(hashToken("abc")).toBe(hashToken("abc"));
    expect(hashToken("abc")).not.toContain("abc");
  });
  it("encrypts secrets with authenticated encryption", () => {
    const enc = encryptSecret("JBSWY3DPEHPK3PXP");
    expect(enc).not.toContain("JBSWY3DP");
    expect(decryptSecret(enc)).toBe("JBSWY3DPEHPK3PXP");
    const parts = enc.split(".");
    parts[3] = Buffer.from("tampered").toString("base64url");
    expect(() => decryptSecret(parts.join("."))).toThrow();
  });
  it("compares in constant time", () => {
    expect(safeEqual("a", "a")).toBe(true);
    expect(safeEqual("a", "b")).toBe(false);
    expect(safeEqual("a", "ab")).toBe(false);
  });
});

describe("passwords", () => {
  it("uses Argon2id and verifies", async () => {
    const h = await hashPassword("correct horse battery staple");
    expect(h.startsWith("$argon2id$")).toBe(true);
    expect(await verifyPassword(h, "correct horse battery staple")).toBe(true);
    expect(await verifyPassword(h, "wrong")).toBe(false);
    expect(await verifyPassword(null, "anything")).toBe(false);
  });
  it("enforces a minimum policy", () => {
    expect(passwordPolicyError("short")).toMatch(/12/);
    expect(passwordPolicyError("password12345678")).toMatch(/common/);
    expect(passwordPolicyError("aaaaaaaaaaaaaa")).toBeTruthy();
    expect(passwordPolicyError("tea-kettle-monsoon-42")).toBeNull();
  });
});

describe("log and email safety", () => {
  it("redacts PHI and secrets from audit details", () => {
    expect(redact({ full_name: "X", mobile: "9", token: "t", password: "p", notes: "n", answer: "a", photoId: "ok", rows: 3 })).toEqual({ photoId: "ok", rows: 3 });
  });
  it("strips CR/LF to prevent email header injection", () => {
    expect(headerSafe("Hi\r\nBcc: victim@example.com")).toBe("Hi Bcc: victim@example.com");
  });
  it("verifies webhook HMAC signatures", () => {
    const body = '{"entry":[]}';
    const sig = "sha256=" + crypto.createHmac("sha256", "s3cret").update(body).digest("hex");
    expect(verifyWebhookSignature(body, sig, "s3cret")).toBe(true);
    expect(verifyWebhookSignature(body + " ", sig, "s3cret")).toBe(false);
    expect(verifyWebhookSignature(body, null, "s3cret")).toBe(false);
  });
});
