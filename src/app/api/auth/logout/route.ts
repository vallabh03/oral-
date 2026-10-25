import { handler, json } from "@/lib/server/http";
import { logout } from "@/lib/server/services/auth";
import { cookieOptions, staffCookieName } from "@/lib/server/security/session";

export const POST = handler({ auth: "staff-pending-mfa" }, async ({ staff, correlationId }) => {
  await logout(staff!, correlationId);
  const res = json({ ok: true });
  res.cookies.set(staffCookieName(), "", cookieOptions(0));
  return res;
});
