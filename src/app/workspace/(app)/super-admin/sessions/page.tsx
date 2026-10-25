import { requireStaff } from "@/lib/server/pageAuth";
import { listActiveSessions } from "@/lib/server/services/admin";
import { SessionsAdmin } from "@/components/client/AdminPanels";

export const metadata = { title: "Active sessions" };

export default async function SessionsPage() {
  const staff = await requireStaff("sessions.revoke");
  const sessions = await listActiveSessions();
  return (
    <>
      <h1 style={{ fontSize: "var(--step-3)" }}>Active sessions</h1>
      <SessionsAdmin sessions={JSON.parse(JSON.stringify(sessions))} currentSessionId={staff.sessionId} />
    </>
  );
}
