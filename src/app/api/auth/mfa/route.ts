import { handler, json } from "@/lib/server/http";
import { mfaSchema } from "@/lib/server/schemas";
import { verifyMfa } from "@/lib/server/services/auth";
import { cookieOptions, staffCookieName } from "@/lib/server/security/session";

export const POST = handler({ auth: "staff-pending-mfa", body: mfaSchema }, async ({ staff, body, correlationId }) => {
  const r = await verifyMfa(staff!, body.code, correlationId);
  const res = json({ redirect: r.redirect });
  res.cookies.set(staffCookieName(), r.token, cookieOptions(r.maxAgeSec));
  return res;
});
