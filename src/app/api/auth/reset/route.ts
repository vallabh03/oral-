import { z } from "zod";
import { handler } from "@/lib/server/http";
import { resetCompleteSchema, resetRequestSchema } from "@/lib/server/schemas";
import { completePasswordReset, requestPasswordReset } from "@/lib/server/services/auth";

const schema = z.union([resetRequestSchema.extend({ action: z.literal("request") }).strict(), resetCompleteSchema.extend({ action: z.literal("complete") }).strict()]);

export const POST = handler({ auth: "public", body: schema }, async ({ body, ipKey, correlationId }) => {
  if (body.action === "request") {
    await requestPasswordReset(body.email, ipKey, correlationId);
    return { ok: true, message: "If an account exists for that email, a reset link has been sent." };
  }
  return completePasswordReset(body.token, body.password, ipKey, correlationId);
});
