import { handler } from "@/lib/server/http";
import { LIMITS } from "@/lib/server/security/rateLimit";
import { tutorialCompleteSchema } from "@/lib/server/schemas";
import { completeTutorial } from "@/lib/server/services/virtual";

export const POST = handler(
  { auth: "intake", body: tutorialCompleteSchema, rateLimit: [{ limit: LIMITS.intakeWrite, by: "user" }] },
  async ({ intake, body, correlationId }) => completeTutorial(intake!.patientId, body, correlationId),
);
