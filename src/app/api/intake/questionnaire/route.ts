import { handler } from "@/lib/server/http";
import { questionnaireSchema } from "@/lib/server/schemas";
import { LIMITS } from "@/lib/server/security/rateLimit";
import { loadQuestionnaire, saveQuestionnaire } from "@/lib/server/services/questionnaire";
import { PROTOCOL } from "@/lib/shared/protocol";

export const GET = handler({ auth: "intake" }, async ({ intake }) => {
  const q = await loadQuestionnaire(intake!.patientId);
  return { status: q.status, answers: q.answers, protocol: { id: PROTOCOL.id, version: PROTOCOL.version } };
});

export const POST = handler(
  { auth: "intake", body: questionnaireSchema, rateLimit: [{ limit: LIMITS.intakeWrite, by: "user" }] },
  async ({ intake, body, correlationId }) => saveQuestionnaire(intake!.patientId, body.answers, body.complete, body.idempotencyKey, { type: "participant" }, correlationId),
);
