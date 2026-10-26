import { handler, uuidParam } from "@/lib/server/http";
import { Errors } from "@/lib/server/errors";
import { LIMITS } from "@/lib/server/security/rateLimit";
import { retryCaseNotification } from "@/lib/server/services/virtual";

export const POST = handler({ auth: "staff", permission: "virtual.review", rateLimit: [{ limit: LIMITS.notifyRetry, by: "user" }] }, async ({ staff, params, correlationId }) => {
  const id = uuidParam.safeParse(params.id);
  if (!id.success) throw Errors.notFound();
  return retryCaseNotification(staff!, id.data, correlationId);
});
