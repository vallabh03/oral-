import { z } from "zod";
import { handler, json } from "@/lib/server/http";
import { LIMITS } from "@/lib/server/security/rateLimit";
import { exchangeIntakeToken } from "@/lib/server/services/participants";
import { cookieOptions, intakeCookieName } from "@/lib/server/security/session";
import { db } from "@/lib/server/db";

// Exchanges the resume token (from the URL fragment, never sent in a URL) for a short session.
export const POST = handler(
  { auth: "public", body: z.object({ token: z.string().min(20).max(128) }).strict(), rateLimit: [{ limit: LIMITS.tokenExchange, by: "ip" }] },
  async ({ body, correlationId }) => {
    const s = await exchangeIntakeToken(body.token, correlationId);
    const res = json({ ok: true });
    res.cookies.set(intakeCookieName(), s.token, cookieOptions(s.maxAgeSec));
    return res;
  },
);

export const DELETE = handler({ auth: "intake" }, async ({ intake }) => {
  const d = await db();
  await d.query("update intake_sessions set revoked_at = now() where id = $1", [intake!.sessionId]);
  const res = json({ ok: true });
  res.cookies.set(intakeCookieName(), "", cookieOptions(0));
  return res;
});
