import { handler, uuidParam } from "@/lib/server/http";
import { config } from "@/lib/server/config";
import { Errors } from "@/lib/server/errors";
import { readUpload } from "@/lib/server/upload";
import { receiveUpload } from "@/lib/server/services/virtual";

// Step 2 (local/db storage only): the browser PUTs the photo bytes into the quarantine key.
export const PUT = handler({ auth: "intake", rawBody: true }, async ({ req, intake, params }) => {
  const id = uuidParam.safeParse(params.ticketId);
  if (!id.success) throw Errors.notFound();
  const { data } = await readUpload(req, config().CLINICAL_IMAGE_MAX_BYTES);
  return receiveUpload(intake!.patientId, id.data, data, (req.headers.get("content-type") ?? "").split(";")[0]!.trim());
});
