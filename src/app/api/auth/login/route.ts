import { handler, json } from "@/lib/server/http";
import { loginSchema } from "@/lib/server/schemas";
import { login } from "@/lib/server/services/auth";
import { cookieOptions, staffCookieName } from "@/lib/server/security/session";

export const POST = handler({ auth: "public", body: loginSchema }, async ({ body, ipKey, correlationId }) => {
  const r = await login(body.email, body.password, ipKey, correlationId);
  // The CSRF token is returned to the same-origin page only; it accompanies the MFA step.
  const res = json({ next: r.next, csrfToken: r.csrfToken });
  res.cookies.set(staffCookieName(), r.token, cookieOptions(r.maxAgeSec));
  return res;
});
