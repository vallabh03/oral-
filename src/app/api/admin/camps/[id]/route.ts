import { handler, uuidParam } from "@/lib/server/http";
import { Errors } from "@/lib/server/errors";
import { campSchema } from "@/lib/server/schemas";
import { upsertCamp } from "@/lib/server/services/admin";

export const PATCH = handler({ auth: "staff", permission: "camps.manage", body: campSchema }, async ({ staff, params, body, correlationId }) => {
  const id = uuidParam.safeParse(params.id);
  if (!id.success) throw Errors.notFound();
  return upsertCamp(staff!, body, id.data, correlationId);
});
