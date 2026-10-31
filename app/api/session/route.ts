import {
  actor,
  db,
  runtime,
  hash,
  securityPolicy,
  sessionToken,
  originCheck,
  rate,
  log,
  response,
  failure,
  invalidatePolicyCache,
  HttpError,
} from "@/lib/server";
import { dashboardPath } from "@/lib/permissions";
export const dynamic = "force-dynamic";

function cookie(req: Request, value: string, maxAge: number) {
  const secure = new URL(req.url).protocol === "https:";
  return `${secure ? "__Host-care_session" : "care_session"}=${value}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${maxAge}${secure ? "; Secure" : ""}`;
}

export async function POST(req: Request) {
  try {
    originCheck(req);
    const a = await actor(req, { skipSession: true, forceLive: true });
    await rate(a);
    const old = sessionToken(req);
    const kv = runtime().RATE_KV;
    if (old) {
      const oldHash = await hash(old);
      if (kv) await kv.delete(`sess:${oldHash}`);
      await db()
        .prepare(
          "UPDATE app_sessions SET revoked=1 WHERE token_hash=? AND user_id=?",
        )
        .bind(oldHash, a.id)
        .run();
    }
    const token = crypto.randomUUID() + crypto.randomUUID(),
      time = Date.now(),
      policy = await securityPolicy();
    const tokenHash = await hash(token);
    const expiresAt = time + policy.absoluteHours * 3600000;
    await db()
      .prepare(
        "INSERT INTO app_sessions(token_hash,user_id,created_at,last_seen,expires_at,revoked) VALUES (?,?,?,?,?,0)",
      )
      .bind(tokenHash, a.id, time, time, expiresAt)
      .run();
    if (kv) {
      await kv.put(
        `sess:${tokenHash}`,
        JSON.stringify({ userId: a.id, expiresAt, lastSeen: time, createdAt: time }),
        { expirationTtl: Math.min(policy.idleMinutes * 60, 3600) },
      );
    }
    await log(a, "Secure application session started");
    const r = response({ path: dashboardPath(a.role), role: a.role, policy });
    r.headers.set("Set-Cookie", cookie(req, token, policy.absoluteHours * 3600));
    return r;
  } catch (e) {
    return failure(e);
  }
}

export async function DELETE(req: Request) {
  try {
    originCheck(req);
    const token = sessionToken(req);
    if (token) {
      const key = await hash(token);
      const kv = runtime().RATE_KV;
      if (kv) await kv.delete(`sess:${key}`);
      // Fetch the userId bound to this token so we can log the actor correctly.
      // This also acts as a pre-check that the session actually exists before
      // issuing the revocation UPDATE.
      const row = await db()
        .prepare(
          "SELECT user_id FROM app_sessions WHERE token_hash=? AND revoked=0",
        )
        .bind(key)
        .first<{ user_id: string }>();

      // Revoke the session unconditionally — even if no row found, clearing the
      // cookie below is still the right outcome.
      await db()
        .prepare("UPDATE app_sessions SET revoked=1 WHERE token_hash=?")
        .bind(key)
        .run();

      if (row)
        await log(
          { id: row.user_id, name: "", role: "", tenant: "live", demo: false },
          "Application session ended",
        );
    }
    const r = response({ ok: true });
    r.headers.set("Set-Cookie", cookie(req, "", 0));
    return r;
  } catch (e) {
    return failure(e);
  }
}

export async function GET(req: Request) {
  try {
    const a = await actor(req);
    await rate(a);
    const s = await db()
      .prepare(
        "SELECT expires_at FROM app_sessions WHERE token_hash=? AND revoked=0",
      )
      .bind(await hash(sessionToken(req)))
      .first<{ expires_at: number }>();
    // securityPolicy() is cached — near-zero cost after warm-up
    return response({
      role: a.role,
      policy: await securityPolicy(),
      expiresAt: s?.expires_at,
    });
  } catch (e) {
    return failure(e);
  }
}
