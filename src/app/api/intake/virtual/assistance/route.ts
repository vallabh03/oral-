import { handler } from "@/lib/server/http";
import { LIMITS } from "@/lib/server/security/rateLimit";
import { virtualAssistanceSchema } from "@/lib/server/schemas";
import { requestAssistance } from "@/lib/server/services/virtual";

export const POST = handler(
  { auth: "intake", body: virtualAssistanceSchema, rateLimit: [{ limit: LIMITS.intakeWrite, by: "user" }] },
  async ({ intake, body, correlationId }) => requestAssistance(intake!.patientId, body.note, correlationId),
);
