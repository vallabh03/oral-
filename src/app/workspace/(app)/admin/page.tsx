import Link from "next/link";
import { requireStaff } from "@/lib/server/pageAuth";
import { dashboardCounts } from "@/lib/server/services/admin";
import { BarList, StatGrid } from "@/components/Stats";
import { PATHWAYS } from "@/lib/shared/classification";

export const metadata = { title: "Doctor dashboard" };

export default async function AdminDashboard() {
  const staff = await requireStaff("patient.read");
  const { counts: c, byCamp } = await dashboardCounts(staff, {});
  return (
    <div className="stack" style={{ "--stack": "24px" } as React.CSSProperties}>
      <div className="cluster" style={{ justifyContent: "space-between" }}>
        <h1 style={{ fontSize: "var(--step-3)", margin: 0 }}>Clinical dashboard</h1>
        <div className="cluster">
          <Link href="/workspace/patients" className="btn btn-secondary btn-sm">Find participant</Link>
          <Link href="/workspace/patients/new" className="btn btn-primary btn-sm">Register participant</Link>
        </div>
      </div>
      <StatGrid items={[
        { label: "Registered", value: c.registered ?? 0 },
        { label: "In person", value: c.in_person ?? 0 },
        { label: "Virtual", value: c.virtual ?? 0 },
        { label: "Questionnaires completed", value: c.questionnaires_completed ?? 0 },
        { label: "Awaiting examination", value: c.awaiting_exam ?? 0 },
        { label: "Awaiting verification", value: c.awaiting_verification ?? 0 },
        { label: "Categorised", value: c.categorised ?? 0 },
        { label: "Report ready", value: c.report_ready ?? 0 },
        { label: "Follow-up due", value: c.follow_up_due ?? 0 },
      ]} />
      <div className="grid" style={{ "--min": "320px" } as React.CSSProperties}>
        <BarList title="Verified screening categories" rows={[1, 2, 3, 4].map((g) => ({ label: `Group ${g} — ${PATHWAYS[g as 1 | 2 | 3 | 4]}`, value: c[`group${g}`] ?? 0 }))} />
        <BarList title="Registrations by camp" rows={byCamp.map((b) => ({ label: b.camp ?? "No camp", value: b.registered }))} />
      </div>
      <p className="hint">Screening categories are programme pathways, not diagnoses.</p>
    </div>
  );
}
