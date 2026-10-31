import "server-only";
import { db } from "./db";

/**
 * Background maintenance tasks to prevent database table bloat and connection pool contention
 * under heavy sustained load. Expired ephemeral records (rate limits, abandoned upload tickets,
 * expired one-time login codes, expired sessions) are purged periodically.
 */
export async function purgeExpiredRecords(): Promise<{
  rateLimitsPurged: number;
  uploadTicketsPurged: number;
  otpsPurged: number;
  sessionsPurged: number;
  intakeSessionsPurged: number;
  intakeTokensPurged: number;
}> {
  const d = await db();

  // Purge rate limits older than 2 hours (maximum rate limit window across the app is 1 hour)
  const rl = await d.query<{ count: number }>(
    "with deleted as (delete from rate_limits where window_start < now() - interval '2 hours' returning 1) select count(*)::int as count from deleted",
  );

  // Purge uncompleted, expired upload tickets older than 2 hours
  const ut = await d.query<{ count: number }>(
    "with deleted as (delete from virtual_upload_tickets where expires_at < now() - interval '2 hours' and completed_at is null returning 1) select count(*)::int as count from deleted",
  );

  // Purge expired participant OTPs older than 24 hours
  const otp = await d.query<{ count: number }>(
    "with deleted as (delete from participant_otps where expires_at < now() - interval '24 hours' returning 1) select count(*)::int as count from deleted",
  );

  // Purge revoked/expired app sessions older than 24 hours
  const sess = await d.query<{ count: number }>(
    "with deleted as (delete from app_sessions where expires_at < now() - interval '24 hours' returning 1) select count(*)::int as count from deleted",
  );

  // Purge revoked/expired intake sessions older than 24 hours
  const intake = await d.query<{ count: number }>(
    "with deleted as (delete from intake_sessions where expires_at < now() - interval '24 hours' returning 1) select count(*)::int as count from deleted",
  );

  // Purge revoked/expired intake and qr tokens older than 24 hours
  const intakeTokens = await d.query<{ count: number }>(
    "with deleted as (delete from intake_tokens where (expires_at is not null and expires_at < now() - interval '24 hours') or (revoked_at is not null and revoked_at < now() - interval '24 hours') returning 1) select count(*)::int as count from deleted",
  );

  return {
    rateLimitsPurged: rl.rows[0]?.count ?? 0,
    uploadTicketsPurged: ut.rows[0]?.count ?? 0,
    otpsPurged: otp.rows[0]?.count ?? 0,
    sessionsPurged: sess.rows[0]?.count ?? 0,
    intakeSessionsPurged: intake.rows[0]?.count ?? 0,
    intakeTokensPurged: intakeTokens.rows[0]?.count ?? 0,
  };
}

let maintenanceTimer: NodeJS.Timeout | undefined;

/**
 * Starts periodic maintenance worker (runs every 15 minutes).
 * Started from instrumentation.ts.
 */
export function startMaintenanceWorker(intervalMs = 15 * 60 * 1000) {
  if (maintenanceTimer) return;
  maintenanceTimer = setInterval(() => {
    void purgeExpiredRecords().catch((e) => {
      console.error("[maintenance] purge failed", (e as Error).message);
    });
  }, intervalMs);
  maintenanceTimer.unref();
}
