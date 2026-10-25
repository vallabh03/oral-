import Link from "next/link";
import crypto from "node:crypto";
import { notFound } from "next/navigation";
import { requireStaff } from "@/lib/server/pageAuth";
import { readReport } from "@/lib/server/services/clinical";
import { AppError } from "@/lib/server/errors";
import { PrintButton } from "@/components/client/CopyButton";
import { SITE } from "@/content/site";

export const metadata = { title: "Screening report" };

export default async function ReportPage({ params }: { params: Promise<{ id: string }> }) {
  const staff = await requireStaff("report.read");
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  let r;
  try {
    r = await readReport(staff, id, crypto.randomUUID());
  } catch (e) {
    if (e instanceof AppError && e.status === 404) notFound();
    throw e;
  }
  const s = r.snapshot as Record<string, string | number | null>;
  return (
    <>
      <div className="cluster no-print" style={{ marginBottom: 16 }}>
        <Link href={`/workspace/patients/${r.patient_id}`} className="btn btn-ghost btn-sm">← Back to record</Link>
        <PrintButton label="Print / save as PDF" />
      </div>
      <article className="report">
        <header style={{ borderBottom: "2px solid #14366e", paddingBottom: 12, marginBottom: 20 }}>
          <p style={{ margin: 0, fontWeight: 800, letterSpacing: "0.06em", color: "#14366e" }}>{SITE.name.toUpperCase()} · DRIVE SAFE</p>
          <h1>Oral health screening report</h1>
          <p style={{ margin: 0 }}>Report version {r.version} · generated {new Date(r.created_at).toLocaleString("en-IN")}</p>
        </header>
        <dl className="dl" style={{ marginBottom: 20 }}>
          <dt>Participant</dt><dd>{s.name}</dd>
          <dt>Participant ID</dt><dd>{s.displayId}</dd>
          <dt>Age</dt><dd>{s.age}</dd>
          <dt>Examination verified</dt><dd>{s.verifiedAt ? new Date(String(s.verifiedAt)).toLocaleString("en-IN") : "—"} by {s.verifiedBy}</dd>
        </dl>
        <h2 style={{ fontSize: "1.3rem" }}>Screening category</h2>
        <p><span className="group-badge">Group {s.group}</span></p>
        <p><strong>Pathway:</strong> {s.pathway}</p>
        {s.impression && <p><strong>Clinical impression:</strong> {s.impression}</p>}
        <h2 style={{ fontSize: "1.3rem" }}>What this means</h2>
        <p>{s.guidance}</p>
        <p style={{ border: "1px solid #bbb", padding: 12, borderRadius: 8, fontSize: "0.9rem" }}>{s.disclaimer}</p>
      </article>
    </>
  );
}
