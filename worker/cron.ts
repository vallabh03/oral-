/**
 * Cloudflare Cron Trigger — scheduled background maintenance.
 *
 * Runs nightly (configured in wrangler.toml) to:
 *  1. Purge expired app_sessions     — prevents unbounded table growth
 *  2. Purge stale rate-limit rows     — only relevant when RATE_KV is not bound
 *  3. Trim app_errors to newest 500  — keeps the error log manageable
 *
 * To register: add the following to wrangler.toml
 *
 *   [triggers]
 *   crons = ["0 3 * * *"]   # 03:00 UTC every day
 *
 * The handler name must be `scheduled` and exported from the Worker entrypoint.
 */

interface Env {
  DB: D1Database;
}

export async function scheduled(
  _event: ScheduledEvent,
  env: Env,
  _ctx: ExecutionContext,
): Promise<void> {
  const db = env.DB;
  const now = Date.now();
  // Keep sessions that expired within the last 7 days so admins can review them;
  // purge anything older.
  const sessionCutoff = now - 7 * 24 * 3600 * 1000;
  const minuteBucket = Math.floor(now / 60000);

  const results = await db.batch([
    // 1. Purge expired sessions
    db.prepare("DELETE FROM app_sessions WHERE expires_at < ?").bind(sessionCutoff),

    // 2. Purge stale rate-limit rows (D1 fallback path only)
    db.prepare("DELETE FROM limits WHERE expires < ?").bind(minuteBucket - 1),

    // 3. Trim app_errors to the newest 500 entries
    db.prepare(`
      DELETE FROM app_errors
      WHERE id NOT IN (
        SELECT id FROM app_errors ORDER BY at DESC LIMIT 500
      )
    `),
  ]);

  // Log a summary for Cloudflare Logpush / tail workers.
  console.log("[cron] maintenance complete", {
    sessionsDeleted: results[0].meta.changes,
    limitsDeleted: results[1].meta.changes,
    errorsDeleted: results[2].meta.changes,
    ranAt: new Date().toISOString(),
  });
}
