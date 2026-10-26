import { handler } from "@/lib/server/http";
import { patientCase } from "@/lib/server/services/virtual";

// The participant's own virtual-screening case: status, photos per view, what is still needed.
export const GET = handler({ auth: "intake" }, async ({ intake }) => patientCase(intake!.patientId));
