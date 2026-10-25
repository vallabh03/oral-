import "server-only";
import { hash, verify, type Algorithm } from "@node-rs/argon2";

// Argon2id with OWASP-recommended parameters (m=19 MiB, t=2, p=1).
const ARGON2ID = 2 as Algorithm; // const enum value (isolatedModules cannot read ambient const enums)
const OPTS = { algorithm: ARGON2ID, memoryCost: 19456, timeCost: 2, parallelism: 1 } as const;

// Used when the account does not exist so response time does not reveal enumeration.
let dummyHash: Promise<string> | undefined;

export async function hashPassword(plain: string): Promise<string> {
  return hash(plain, OPTS);
}

export async function verifyPassword(stored: string | null | undefined, plain: string): Promise<boolean> {
  const target = stored ?? (await (dummyHash ??= hash("dummy-password-for-timing", OPTS)));
  try {
    const ok = await verify(target, plain);
    return ok && !!stored;
  } catch {
    return false;
  }
}

/** Minimum policy: 12+ chars, not trivially weak. Long passphrases are encouraged. */
export function passwordPolicyError(pw: string, email?: string): string | null {
  if (pw.length < 12) return "Use at least 12 characters.";
  if (pw.length > 128) return "Use at most 128 characters.";
  if (/^(.)\1+$/.test(pw)) return "Avoid repeating a single character.";
  const lowered = pw.toLowerCase();
  if (["password", "123456", "qwerty", "letmein", "welcome"].some((w) => lowered.includes(w))) return "Avoid common passwords.";
  if (email && lowered.includes(email.split("@")[0]!.toLowerCase())) return "Do not include your email name.";
  return null;
}
