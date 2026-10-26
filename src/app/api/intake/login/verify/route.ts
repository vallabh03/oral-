import { handler, json } from "@/lib/server/http";
import { LIMITS } from "@/lib/server/security/rateLimit";
import { otpVerifySchema } from "@/lib/server/schemas";
import { cookieOptions, intakeCookieName } from "@/lib/server/security/session";
import { verifyLoginCode } from "@/lib/server/services/virtual";

export const POST = handler(
  { auth: "public", body: otpVerifySchema, rateLimit: [{ limit: LIMITS.otpVerify, by: "ip" }] },
  async ({ body, correlationId }) => {
    const s = await verifyLoginCode(body, correlationId);
    const res = json({ ok: true });
    res.cookies.set(intakeCookieName(), s.token, cookieOptions(s.maxAgeSec));
    return res;
  },
);
