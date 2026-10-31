import "server-only";
import { db } from "../db";
import { Errors } from "../errors";

export type Limit = { name: string; max: number; windowSec: number };

// Stricter limits on sensitive endpoints (checklist §23, PRD §8.2).
export const LIMITS = {
  login: { name: "login", max: 10, windowSec: 15 * 60 },
  loginAccount: { name: "login-acct", max: 5, windowSec: 15 * 60 },
  mfa: { name: "mfa", max: 8, windowSec: 10 * 60 },
  passwordReset: { name: "pwreset", max: 5, windowSec: 60 * 60 },
  register: { name: "register", max: 20, windowSec: 60 * 60 },
  tokenExchange: { name: "token-exchange", max: 20, windowSec: 15 * 60 },
  intakeWrite: { name: "intake-write", max: 120, windowSec: 15 * 60 },
  photoUpload: { name: "photo-upload", max: 30, windowSec: 15 * 60 },
  clinicalUpload: { name: "clinical-upload", max: 120, windowSec: 15 * 60 },
  clinicalLink: { name: "clinical-link", max: 300, windowSec: 15 * 60 },
  staffPhotoUpload: { name: "staff-photo-upload", max: 600, windowSec: 15 * 60 },
  search: { name: "search", max: 120, windowSec: 5 * 60 },
  contact: { name: "contact", max: 5, windowSec: 60 * 60 },
  events: { name: "events", max: 120, windowSec: 10 * 60 },
  export: { name: "export", max: 10, windowSec: 60 * 60 },
  report: { name: "report", max: 60, windowSec: 15 * 60 },
  whatsapp: { name: "whatsapp", max: 30, windowSec: 60 * 60 },
  staffWrite: { name: "staff-write", max: 600, windowSec: 15 * 60 },
  virtualUpload: { name: "virtual-upload", max: 60, windowSec: 15 * 60 },
  otpRequest: { name: "otp-request", max: 5, windowSec: 60 * 60 },
  otpRequestPatient: { name: "otp-request-id", max: 3, windowSec: 15 * 60 },
  otpVerify: { name: "otp-verify", max: 20, windowSec: 15 * 60 },
  notifyRetry: { name: "notify-retry", max: 60, windowSec: 60 * 60 },
} satisfies Record<string, Limit>;

const memoryBlocks = new Map<string, number>();

/**
 * Fixed-window counter stored in the database so limits hold across Lambda instances.
 * Protected by an in-memory shield so flood attacks cannot exhaust the DB connection pool.
 * Throws a 429 AppError when the limit is exceeded.
 */
export async function enforceRateLimit(limit: Limit, key: string): Promise<void> {
  if (process.env.DISABLE_RATE_LIMITS === "1" && process.env.APP_ENV === "test") return;
  const bucket = `${limit.name}:${key}`;
  const now = Date.now();
  const blockedUntil = memoryBlocks.get(bucket);
  if (blockedUntil && now < blockedUntil) {
    const remainingSec = Math.max(1, Math.ceil((blockedUntil - now) / 1000));
    throw Errors.rateLimited(remainingSec);
  } else if (blockedUntil) {
    memoryBlocks.delete(bucket);
  }

  const d = await db();
  const r = await d.query<{ count: number; window_start: string; elapsed: number }>(
    `insert into rate_limits (bucket, window_start, count) values ($1, now(), 1)
     on conflict (bucket) do update set
       count = case when rate_limits.window_start < now() - make_interval(secs => $2) then 1 else rate_limits.count + 1 end,
       window_start = case when rate_limits.window_start < now() - make_interval(secs => $2) then now() else rate_limits.window_start end
     returning count, window_start, extract(epoch from now() - window_start)::float8 as elapsed`,
    [bucket, limit.windowSec],
  );
  const row = r.rows[0]!;
  if (row.count > limit.max) {
    const retryAfter = Math.max(1, Math.ceil(limit.windowSec - row.elapsed));
    memoryBlocks.set(bucket, now + retryAfter * 1000);
    // Periodically prune stale blocks if the map grows large
    if (memoryBlocks.size > 5000) {
      for (const [k, exp] of memoryBlocks) {
        if (now >= exp) memoryBlocks.delete(k);
      }
    }
    throw Errors.rateLimited(retryAfter);
  }
}

export async function resetRateLimit(limit: Limit, key: string) {
  const bucket = `${limit.name}:${key}`;
  memoryBlocks.delete(bucket);
  const d = await db();
  await d.query("delete from rate_limits where bucket = $1", [bucket]);
}
