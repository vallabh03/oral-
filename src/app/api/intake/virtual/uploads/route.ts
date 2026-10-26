import { handler, json } from "@/lib/server/http";
import { LIMITS } from "@/lib/server/security/rateLimit";
import { virtualTicketSchema } from "@/lib/server/schemas";
import { createUploadTicket } from "@/lib/server/services/virtual";

// Step 1 of an upload: a short-lived target (presigned S3 PUT to a quarantine key in production).
export const POST = handler(
  { auth: "intake", body: virtualTicketSchema, rateLimit: [{ limit: LIMITS.virtualUpload, by: "user" }] },
  async ({ intake, body, correlationId }) => json(await createUploadTicket(intake!.patientId, body, correlationId), 201),
);
