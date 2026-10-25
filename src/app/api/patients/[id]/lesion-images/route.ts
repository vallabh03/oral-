import { handler, json, uuidParam } from "@/lib/server/http";
import { config } from "@/lib/server/config";
import { Errors } from "@/lib/server/errors";
import { LIMITS } from "@/lib/server/security/rateLimit";
import { lesionUploadQuerySchema } from "@/lib/server/schemas";
import { readUpload } from "@/lib/server/upload";
import { assertClinicalImagesEnabled, listLesionImages, uploadLesionImage } from "@/lib/server/services/lesionImages";

// Lesion images for one participant (PRD v1.2). Doctor Admin only; checks live in the service.
export const GET = handler({ auth: "staff", permission: "clinical_image.view" }, async ({ staff, params, correlationId }) => {
  const id = uuidParam.safeParse(params.id);
  if (!id.success) throw Errors.notFound();
  return listLesionImages(staff!, id.data, correlationId);
});

export const POST = handler(
  { auth: "staff", permission: "clinical_image.capture", rawBody: true, rateLimit: [{ limit: LIMITS.clinicalUpload, by: "user" }] },
  async ({ req, staff, params, correlationId }) => {
    const id = uuidParam.safeParse(params.id);
    if (!id.success) throw Errors.notFound();
    assertClinicalImagesEnabled(); // before reading up to 15 MB of body
    const q = lesionUploadQuerySchema.parse(Object.fromEntries(req.nextUrl.searchParams));
    const { data, key } = await readUpload(req, config().CLINICAL_IMAGE_MAX_BYTES);
    const r = await uploadLesionImage(staff!, id.data, { ...q, idempotencyKey: key }, data, correlationId);
    return json(r, r.replayed ? 200 : 201);
  },
);
