import { handler, json, uuidParam } from "@/lib/server/http";
import { Errors } from "@/lib/server/errors";
import { LIMITS } from "@/lib/server/security/rateLimit";
import { completeUpload } from "@/lib/server/services/virtual";

// Step 3: validate the quarantined upload, strip metadata, check quality and link it to the case.
export const POST = handler({ auth: "intake", rateLimit: [{ limit: LIMITS.virtualUpload, by: "user" }] }, async ({ intake, params, correlationId }) => {
  const id = uuidParam.safeParse(params.ticketId);
  if (!id.success) throw Errors.notFound();
  const r = await completeUpload(intake!.patientId, id.data, correlationId);
  return json(r, r.replayed ? 200 : 201);
});
