import { handler, json } from "@/lib/server/http";
import { registrationSchema, searchSchema } from "@/lib/server/schemas";
import { LIMITS } from "@/lib/server/security/rateLimit";
import { searchPatients } from "@/lib/server/services/records";
import { registerParticipant } from "@/lib/server/services/participants";

export const GET = handler(
  { auth: "staff", permission: "patient.search", rateLimit: [{ limit: LIMITS.search, by: "user" }] },
  async ({ req, staff, correlationId }) => {
    const params = searchSchema.parse(Object.fromEntries(req.nextUrl.searchParams));
    return searchPatients(staff!, params, correlationId);
  },
);

// Camp-assisted registration by an Admin (after duplicate checks and consent capture).
export const POST = handler(
  { auth: "staff", permission: "patient.create", body: registrationSchema, rateLimit: [{ limit: LIMITS.staffWrite, by: "user" }] },
  async ({ staff, body, correlationId }) => {
    const r = await registerParticipant(body, { type: "staff", staff: staff! }, correlationId);
    return json({ id: r.patientId, displayId: r.displayId, replayed: r.replayed }, r.replayed ? 200 : 201);
  },
);
