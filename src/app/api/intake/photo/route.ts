import { handler, json } from "@/lib/server/http";
import { LIMITS } from "@/lib/server/security/rateLimit";
import { readUpload } from "@/lib/server/upload";
import { savePatientPhoto } from "@/lib/server/services/photos";

export const POST = handler(
  { auth: "intake", rawBody: true, rateLimit: [{ limit: LIMITS.photoUpload, by: "user" }] },
  async ({ req, intake, correlationId }) => {
    const { data, key } = await readUpload(req);
    const photo = await savePatientPhoto(intake!.patientId, data, key, { type: "participant" }, correlationId);
    return json({ id: photo.id, width: photo.width, height: photo.height, replayed: photo.replayed }, photo.replayed ? 200 : 201);
  },
);
