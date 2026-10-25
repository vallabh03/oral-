import { handler, uuidParam } from "@/lib/server/http";
import { Errors } from "@/lib/server/errors";
import { updateUserSchema } from "@/lib/server/schemas";
import { updateUser } from "@/lib/server/services/admin";

export const PATCH = handler({ auth: "staff", permission: "users.manage", body: updateUserSchema }, async ({ staff, params, body, correlationId }) => {
  const id = uuidParam.safeParse(params.id);
  if (!id.success) throw Errors.notFound();
  return updateUser(staff!, id.data, body, correlationId);
});
