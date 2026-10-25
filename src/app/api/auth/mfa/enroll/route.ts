import { z } from "zod";
import { handler, json } from "@/lib/server/http";
import { mfaSchema } from "@/lib/server/schemas";
import { beginMfaEnrollment, completeMfaEnrollment } from "@/lib/server/services/auth";
import { cookieOptions, staffCookieName } from "@/lib/server/security/session";

const schema = z.union([z.object({ action: z.literal("start") }).strict(), mfaSchema.extend({ action: z.literal("confirm") }).strict()]);

export const POST = handler({ auth: "staff-pending-mfa", body: schema }, async ({ staff, body, correlationId }) => {
  if (body.action === "start") return beginMfaEnrollment(staff!);
  const r = await completeMfaEnrollment(staff!, body.code, correlationId);
  const res = json({ redirect: r.redirect });
  res.cookies.set(staffCookieName(), r.token, cookieOptions(r.maxAgeSec));
  return res;
});
