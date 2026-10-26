import { requireStaff } from "@/lib/server/pageAuth";
import { dashboardCounts, listCamps } from "@/lib/server/services/admin";
import { BarList, StatGrid } from "@/components/Stats";
import { can } from "@/lib/server/authz";
import { PATHWAYS } from "@/lib/shared/classification";

export const metadata = { title: "Programme analytics" };

export default async function AssistantPage({ searchParams }: { searchParams: Promise<{ campId?: string; from?: string; to?: string }> }) {
  const staff = await requireStaff("analytics.read");
  const sp = await searchParams;
  const filters = {
    campId: sp.campId && /^[0-9a-f-]{36}$/.test(sp.campId) ? sp.campId : undefined,
    from: sp.from && /^\d{4}-\d{2}-\d{2}$/.test(sp.from) ? sp.from : undefined,
    to: sp.to && /^\d{4}-\d{2}-\d{2}$/.test(sp.to) ? sp.to : undefined,
  };
  const [{ counts: c, byCamp }, camps] = await Promise.all([dashboardCounts(staff, filters), listCamps()]);
  const qs = new URLSearchParams(Object.entries(filters).filter(([, v]) => v) as [string, string][]).toString();
  return (
    <div className="stack" style={{ "--stack": "24px" } as React.CSSProperties}>
      <h1 style={{ fontSize: "var(--step-3)" }}>Programme analytics</h1>
      <p className="hint">Aggregated, de-identified counts. No names, phone numbers or clinical notes are shown here.</p>
      <form className="toolbar" method="get">
        <div className="field"><label htmlFor="an-camp">Camp</label>
          <select id="an-camp" name="campId" defaultValue={filters.campId ?? ""}><option value="">All camps</option>{camps.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select></div>
        <div className="field" style={{ flex: "0 1 180px" }}><label htmlFor="an-from">From</label><input id="an-from" type="date" name="from" defaultValue={filters.from} /></div>
        <div className="field" style={{ flex: "0 1 180px" }}><label htmlFor="an-to">To</label><input id="an-to" type="date" name="to" defaultValue={filters.to} /></div>
        <button className="btn btn-primary">Apply</button>
        {can(staff.role, "export.deidentified") && <a className="btn btn-secondary" href={`/api/exports/deidentified${qs ? `?${qs}` : ""}`}>Download de-identified CSV</a>}
      </form>
      <StatGrid items={[
        { label: "Registered", value: c.registered ?? 0 },
        { label: "In person", value: c.in_person ?? 0 },
        { label: "Virtual", value: c.virtual ?? 0 },
        { label: "Questionnaires completed", value: c.questionnaires_completed ?? 0 },
        { label: "Categorised (verified)", value: c.categorised ?? 0 },
        { label: "Follow-up due", value: c.follow_up_due ?? 0 },
        { label: "Withdrawn", value: c.withdrawn ?? 0 },
      ]} />
      <div className="grid" style={{ "--min": "320px" } as React.CSSProperties}>
        <BarList title="Verified screening categories" rows={[1, 2, 3, 4].map((g) => ({ label: `Group ${g} — ${PATHWAYS[g as 1 | 2 | 3 | 4]}`, value: c[`group${g}`] ?? 0 }))} />
        <BarList title="Registered by camp" rows={byCamp.map((b) => ({ label: b.camp ?? "No camp", value: b.registered }))} />
      </div>
    </div>
  );
}
