import { handler, uuidParam } from "@/lib/server/http";
import { Errors } from "@/lib/server/errors";
import { LIMITS } from "@/lib/server/security/rateLimit";
import { readReport } from "@/lib/server/services/clinical";

export const GET = handler({ auth: "staff", permission: "report.read", rateLimit: [{ limit: LIMITS.report, by: "user" }] }, async ({ staff, params, correlationId }) => {
  const id = uuidParam.safeParse(params.id);
  if (!id.success) throw Errors.notFound();
  return readReport(staff!, id.data, correlationId);
});
