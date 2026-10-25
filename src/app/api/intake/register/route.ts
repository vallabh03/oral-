import { handler, json } from "@/lib/server/http";
import { registrationSchema } from "@/lib/server/schemas";
import { LIMITS } from "@/lib/server/security/rateLimit";
import { registerParticipant } from "@/lib/server/services/participants";
import { createIntakeSession, cookieOptions, intakeCookieName } from "@/lib/server/security/session";

export const POST = handler(
  { auth: "public", body: registrationSchema, rateLimit: [{ limit: LIMITS.register, by: "ip" }] },
  async ({ body, correlationId }) => {
    const r = await registerParticipant(body, { type: "participant" }, correlationId);
    if (r.replayed) return json({ displayId: r.displayId, replayed: true }, 200);
    const session = await createIntakeSession(r.patientId);
    const res = json({ displayId: r.displayId, resumeToken: r.intakeToken, replayed: r.replayed }, r.replayed ? 200 : 201);
    res.cookies.set(intakeCookieName(), session.token, cookieOptions(session.maxAgeSec));
    return res;
  },
);
