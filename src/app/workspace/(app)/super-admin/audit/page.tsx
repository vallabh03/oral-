import { requireStaff } from "@/lib/server/pageAuth";
import { recentAudit, recentErrors } from "@/lib/server/services/admin";
import { EmptyState } from "@/components/SiteChrome";

export const metadata = { title: "Audit log" };

export default async function AuditPage({ searchParams }: { searchParams: Promise<{ action?: string; outcome?: string }> }) {
  await requireStaff("audit.read");
  const sp = await searchParams;
  const action = sp.action && /^[a-z_.]{1,40}$/.test(sp.action) ? sp.action : undefined;
  const outcome = ["success", "denied", "failure"].includes(sp.outcome ?? "") ? sp.outcome : undefined;
  const [events, errors] = await Promise.all([recentAudit({ action, outcome, limit: 200 }), recentErrors()]);
  return (
    <div className="stack" style={{ "--stack": "24px" } as React.CSSProperties}>
      <h1 style={{ fontSize: "var(--step-3)" }}>Audit log</h1>
      <form className="toolbar" method="get">
        <div className="field"><label htmlFor="a-action">Action starts with</label><input id="a-action" name="action" type="text" defaultValue={action} placeholder="e.g. patient. or auth." maxLength={40} /></div>
        <div className="field" style={{ flex: "0 1 200px" }}><label htmlFor="a-out">Outcome</label>
          <select id="a-out" name="outcome" defaultValue={outcome ?? ""}><option value="">Any</option><option value="success">Success</option><option value="denied">Denied</option><option value="failure">Failure</option></select></div>
        <button className="btn btn-primary">Filter</button>
      </form>
      {events.length === 0 ? <EmptyState title="No audit events match" /> : (
        <div className="table-wrap">
          <table className="data responsive">
            <caption className="visually-hidden">Audit events (details redacted)</caption>
            <thead><tr><th>#</th><th>Time</th><th>Actor</th><th>Action</th><th>Target</th><th>Outcome</th><th>Code</th></tr></thead>
            <tbody>
              {events.map((e) => (
                <tr key={e.seq}>
                  <td data-label="#">{e.seq}</td>
                  <td data-label="Time">{new Date(e.occurred_at).toLocaleString("en-IN")}</td>
                  <td data-label="Actor">{e.actor_email ?? e.actor_type}</td>
                  <td data-label="Action"><code>{e.action}</code></td>
                  <td data-label="Target">{e.target_type ? `${e.target_type}:${(e.target_ref ?? "").slice(0, 8)}` : "—"}</td>
                  <td data-label="Outcome"><span className={`badge ${e.outcome === "success" ? "badge-ok" : "badge-danger"}`}>{e.outcome}</span></td>
                  <td data-label="Code">{e.code ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <h2 style={{ fontSize: "var(--step-2)" }}>Application errors</h2>
      {errors.length === 0 ? <EmptyState title="No application errors recorded" icon="check" /> : (
        <div className="table-wrap">
          <table className="data responsive">
            <thead><tr><th>Time</th><th>Category</th><th>Code</th><th>Route</th><th>Correlation</th></tr></thead>
            <tbody>{errors.map((e, i) => <tr key={i}><td data-label="Time">{new Date(e.occurred_at).toLocaleString("en-IN")}</td><td data-label="Category">{e.category}</td><td data-label="Code">{e.code}</td><td data-label="Route">{e.route}</td><td data-label="Correlation"><code>{e.correlation_id?.slice(0, 8)}</code></td></tr>)}</tbody>
          </table>
        </div>
      )}
    </div>
  );
}
