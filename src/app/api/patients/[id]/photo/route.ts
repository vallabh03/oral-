import { handler, json, uuidParam } from "@/lib/server/http";
import { Errors } from "@/lib/server/errors";
import { LIMITS } from "@/lib/server/security/rateLimit";
import { readUpload } from "@/lib/server/upload";
import { savePatientPhoto } from "@/lib/server/services/photos";

export const POST = handler(
  { auth: "staff", permission: "patient.photo.write", rawBody: true, rateLimit: [{ limit: LIMITS.staffPhotoUpload, by: "user" }] },
  async ({ req, staff, params, correlationId }) => {
    const id = uuidParam.safeParse(params.id);
    if (!id.success) throw Errors.notFound();
    const { data, key } = await readUpload(req);
    const photo = await savePatientPhoto(id.data, data, key, { type: "staff", staff: staff! }, correlationId);
    return json({ id: photo.id, width: photo.width, height: photo.height, replayed: photo.replayed }, photo.replayed ? 200 : 201);
  },
);
