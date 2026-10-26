import { requireStaff } from "@/lib/server/pageAuth";
import { listCamps } from "@/lib/server/services/admin";
import { StaffRegistration } from "@/components/client/StaffRegistration";
import { config } from "@/lib/server/config";

export const metadata = { title: "Register participant" };

export default async function NewPatientPage() {
  const staff = await requireStaff("patient.create");
  const camps = (await listCamps())
    .filter((c) => ["planned", "active"].includes(c.status) && (!staff.campScope || staff.campScope.includes(c.id)))
    .map((c) => ({ id: c.id, name: c.name, working_area: c.working_area }));
  return (
    <div style={{ maxWidth: 900 }}>
      <h1 style={{ fontSize: "var(--step-3)" }}>Register a participant (camp-assisted)</h1>
      <p className="hint">Search first to avoid duplicates. Read each consent aloud in the participant&apos;s language and tick only what they agree to.</p>
      <div className="card" style={{ marginTop: 16 }}><StaffRegistration camps={camps} virtualPhotos={config().VIRTUAL_SCREENING_ENABLED} /></div>
    </div>
  );
}
