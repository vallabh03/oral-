import { handler, uuidParam } from "@/lib/server/http";
import { Errors } from "@/lib/server/errors";
import { caseDetail } from "@/lib/server/services/virtual";

export const GET = handler({ auth: "staff", permission: "virtual.review" }, async ({ staff, params, correlationId }) => {
  const id = uuidParam.safeParse(params.id);
  if (!id.success) throw Errors.notFound();
  return caseDetail(staff!, id.data, correlationId);
});
