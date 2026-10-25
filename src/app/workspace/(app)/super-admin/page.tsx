import Link from "next/link";
import { requireStaff } from "@/lib/server/pageAuth";
import { conversionCounts, dashboardCounts, listUsers } from "@/lib/server/services/admin";
import { verifyAuditChain } from "@/lib/server/audit";
import { BarList, StatGrid } from "@/components/Stats";

export const metadata = { title: "Super Admin overview" };

export default async function SuperAdminHome() {
  const staff = await requireStaff("users.manage");
  const [{ counts: c }, users, conv, chain] = await Promise.all([dashboardCounts(staff, {}), listUsers(), conversionCounts(), verifyAuditChain()]);
  const noMfa = users.filter((u) => u.status === "active" && !u.mfa_enabled).length;
  return (
    <div className="stack" style={{ "--stack": "24px" } as React.CSSProperties}>
      <h1 style={{ fontSize: "var(--step-3)" }}>Platform overview</h1>
      <StatGrid items={[
        { label: "Participants", value: c.registered ?? 0 },
        { label: "Categorised", value: c.categorised ?? 0 },
        { label: "Active staff", value: users.filter((u) => u.status === "active").length },
        { label: "Staff without MFA yet", value: noMfa },
        { label: "Audit events checked", value: chain.checked },
      ]} />
      <div className={`callout ${chain.ok ? "" : "callout-warn"}`} role="status">
        <strong>Audit trail integrity:</strong> {chain.ok ? "verified — no tampering detected." : `BROKEN at event #${chain.brokenAt}. Investigate immediately.`}{" "}
        <Link href="/workspace/super-admin/audit">Open audit log</Link>
      </div>
      <BarList title="Website conversions (last 30 days, consented analytics only)" rows={conv.map((x) => ({ label: x.name.replace(/_/g, " "), value: x.last30 }))} />
    </div>
  );
}
