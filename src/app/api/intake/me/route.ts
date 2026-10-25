import { handler } from "@/lib/server/http";
import { participantStatus } from "@/lib/server/services/participants";

export const GET = handler({ auth: "intake" }, async ({ intake }) => participantStatus(intake!.patientId));
