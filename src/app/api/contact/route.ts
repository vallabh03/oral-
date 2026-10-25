import { handler, json } from "@/lib/server/http";
import { contactSchema } from "@/lib/server/schemas";
import { LIMITS } from "@/lib/server/security/rateLimit";
import { submitContact } from "@/lib/server/services/public";

export const POST = handler({ auth: "public", body: contactSchema, maxBodyBytes: 16 * 1024, rateLimit: [{ limit: LIMITS.contact, by: "ip" }] }, async ({ body, correlationId }) => {
  const r = await submitContact(body, correlationId);
  return json({ ok: true, reference: correlationId.slice(0, 8) }, r.replayed ? 200 : 201);
});
