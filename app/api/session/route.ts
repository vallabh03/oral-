import {
  actor,
  db,
  hash,
  securityPolicy,
  sessionToken,
  originCheck,
  rate,
  log,
  response,
  failure,
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
    if (old)
      await db()
        .prepare(
          "UPDATE app_sessions SET revoked=1 WHERE token_hash=? AND user_id=?",
        )
        .bind(await hash(old), a.id)
        .run();
    const token = crypto.randomUUID() + crypto.randomUUID(),
      time = Date.now(),
      policy = await securityPolicy();
    await db()
      .prepare(
        "INSERT INTO app_sessions(token_hash,user_id,created_at,last_seen,expires_at,revoked) VALUES (?,?,?,?,?,0)",
      )
      .bind(
        await hash(token),
        a.id,
        time,
        time,
        time + policy.absoluteHours * 3600000,
      )
      .run();
    await log(a, "Secure application session started");
    const r = response({ path: dashboardPath(a.role), role: a.role, policy });
    r.headers.set(
      "Set-Cookie",
      cookie(req, token, policy.absoluteHours * 3600),
    );
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
      const row = await db()
        .prepare(
          "SELECT user_id FROM app_sessions WHERE token_hash=? AND revoked=0",
        )
        .bind(key)
        .first<any>();
      await db()
        .prepare("UPDATE app_sessions SET revoked=1 WHERE token_hash=?")
        .bind(key)
        .run();
      if (row)
        await log(
          { id: row.user_id, name: "", role: "", tenant: "live", demo: false },
          "Application session ended or expired",
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
    const s = await db()
      .prepare("SELECT expires_at FROM app_sessions WHERE token_hash=?")
      .bind(await hash(sessionToken(req)))
      .first<any>();
    return response({
      role: a.role,
      policy: await securityPolicy(),
      expiresAt: s?.expires_at,
    });
  } catch (e) {
    return failure(e);
  }
}
