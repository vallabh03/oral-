import { handler } from "@/lib/server/http";
import { LIMITS } from "@/lib/server/security/rateLimit";
import { submitCase } from "@/lib/server/services/virtual";

export const POST = handler({ auth: "intake", rateLimit: [{ limit: LIMITS.intakeWrite, by: "user" }] }, async ({ intake, correlationId }) => submitCase(intake!.patientId, correlationId));
