import { handler, uuidParam } from "@/lib/server/http";
import { Errors } from "@/lib/server/errors";
import { patientDetail } from "@/lib/server/services/records";

export const GET = handler({ auth: "staff", permission: "patient.read" }, async ({ staff, params, correlationId }) => {
  const id = uuidParam.safeParse(params.id);
  if (!id.success) throw Errors.notFound();
  return patientDetail(staff!, id.data, correlationId);
});
