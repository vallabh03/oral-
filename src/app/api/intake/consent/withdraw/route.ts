import { handler } from "@/lib/server/http";
import { consentWithdrawSchema } from "@/lib/server/schemas";
import { LIMITS } from "@/lib/server/security/rateLimit";
import { withdrawConsent } from "@/lib/server/services/participants";

export const POST = handler(
  { auth: "intake", body: consentWithdrawSchema, rateLimit: [{ limit: LIMITS.intakeWrite, by: "user" }] },
  async ({ intake, body, correlationId }) => {
    await withdrawConsent(intake!.patientId, body.consentType, { type: "participant", intakeSessionId: intake!.sessionId }, correlationId);
    return { ok: true };
  },
);
