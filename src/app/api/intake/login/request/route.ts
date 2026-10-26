import { handler } from "@/lib/server/http";
import { LIMITS } from "@/lib/server/security/rateLimit";
import { otpRequestSchema } from "@/lib/server/schemas";
import { requestLoginCode } from "@/lib/server/services/virtual";

// Returning participants: participant ID + mobile → one-time code on WhatsApp. Same answer either way.
export const POST = handler(
  { auth: "public", body: otpRequestSchema, rateLimit: [{ limit: LIMITS.otpRequest, by: "ip" }] },
  async ({ body, correlationId }) => requestLoginCode(body, correlationId),
);
