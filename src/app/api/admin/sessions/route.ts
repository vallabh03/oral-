import { z } from "zod";
import { handler } from "@/lib/server/http";
import { adminRevokeSession, listActiveSessions } from "@/lib/server/services/admin";

export const GET = handler({ auth: "staff", permission: "sessions.revoke" }, async () => ({ sessions: await listActiveSessions() }));

export const DELETE = handler(
  { auth: "staff", permission: "sessions.revoke", body: z.object({ sessionId: z.string().uuid() }).strict() },
  async ({ staff, body, correlationId }) => {
    await adminRevokeSession(staff!, body.sessionId, correlationId);
    return { ok: true };
  },
);
