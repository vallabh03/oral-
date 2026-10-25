import { handler, uuidParam } from "@/lib/server/http";
import { Errors } from "@/lib/server/errors";
import { lesionDeleteSchema } from "@/lib/server/schemas";
import { deleteLesionImage } from "@/lib/server/services/lesionImages";

export const DELETE = handler({ auth: "staff", permission: "clinical_image.delete", body: lesionDeleteSchema }, async ({ staff, params, body, correlationId }) => {
  const id = uuidParam.safeParse(params.imageId);
  if (!id.success) throw Errors.notFound();
  return deleteLesionImage(staff!, id.data, body.reason, correlationId);
});
