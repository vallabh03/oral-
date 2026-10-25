"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { CLINICAL_IMPRESSIONS, LESION_SITES, ORAL_FINDINGS, STATUS_LABELS, type PatientStatus } from "@/lib/shared/constants";
import { PROTOCOL, type Answers } from "@/lib/shared/protocol";
import { CLASSIFICATION_BLOCK_MESSAGES } from "@/lib/shared/classification";
import { CameraCapture } from "./CameraCapture";
import { LesionImagesPanel } from "./LesionImagesPanel";
import { CopyButton } from "./CopyButton";
import { Questionnaire } from "./Questionnaire";
import { newKey, postJson, type ApiError } from "./api";
import { useConfirm } from "./ConfirmDialog";
import { useToast } from "./Toaster";

type Exam = {
  id: string; version: number; status: "draft" | "verified"; exam_completed: string; mouth_opening: string | null; inter_incisor_mm: string | null;
  oral_findings: string[]; lesion_sites: string[]; lesion_present: string | null; clinical_impression: string | null; notes: string | null;
  recorded_by_name: string; recorded_at: string; verified_by_name: string | null; verified_at: string | null; correction_reason: string | null;
};
type Data = {
  patient: { id: string; displayId: string; fullName: string; age: number; mobile: string | null; driverType: string; workingArea: string | null; campName: string | null; status: PatientStatus; habitPresent: boolean | null; groupCode: number | null; pathway: string | null; createdAt: string; createdVia: string; language: string };
  photo: { id: string; thumbUrl: string; fullUrl: string } | null;
  consents: Record<string, string>;
  questionnaire: { status: string; answers: Answers; protocolVersion: string; completedAt: string | null; items: { questionId: string; questionText: string; answer: unknown }[] };
  exams: Exam[];
  classification: { group_code: number; pathway: string } | null;
  reports: { id: string; version: number; created_at: string }[];
  checkedIn: boolean;
  timeline: { at: string; kind: string; label: string; by?: string | null }[];
};

const label = (list: readonly { value: string; label: string }[], v: string | null | undefined) => list.find((x) => x.value === v)?.label ?? v ?? "—";
const fmt = (d: string | null) => (d ? new Date(d).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" }) : "—");

export function PatientRecord({ data, perms }: { data: Data; perms: { clinical: boolean; photo: boolean; whatsapp: boolean; clinicalImages: boolean } }) {
  const router = useRouter();
  const toast = useToast();
  const { confirm, dialog } = useConfirm();
  const [busy, setBusy] = useState("");
  const [retake, setRetake] = useState(false);
  const p = data.patient;
  const latestExam = data.exams[0];
  const withdrawn = p.status === "withdrawn";
  const act = async (name: string, path: string, body: unknown, success: string) => {
    setBusy(name);
    try {
      const r = await postJson<Record<string, unknown>>(`/api/patients/${p.id}/${path}`, body);
      toast(typeof r?.message === "string" && r.message ? r.message : success, r?.blockedReason ? "info" : "success");
      router.refresh();
      return r;
    } catch (e) {
      toast((e as ApiError).message, "error");
      return null;
    } finally {
      setBusy("");
    }
  };

  const verify = async () => {
    if (!latestExam) return;
    const ok = await confirm({ title: `Verify examination v${latestExam.version}?`, body: "Verification locks this examination. Any later change must be recorded as a correction with a reason. The screening category is calculated only after verification.", confirmLabel: "Verify examination" });
    if (ok) await act("verify", "verify", { examId: latestExam.id }, "Examination verified");
  };
  const withdraw = async (type: string, name: string) => {
    const ok = await confirm({ title: `Record withdrawal of ${name} consent?`, body: type === "registration" ? "The participant will be withdrawn from the programme and their links will stop working." : type === "photo" ? "The participant's photo will be deleted." : "Future optional messages will stop.", confirmLabel: "Record withdrawal", danger: true });
    if (ok) await act("withdraw", "withdraw-consent", { consentType: type }, "Withdrawal recorded");
  };

  return (
    <div className="stack" style={{ "--stack": "20px" } as React.CSSProperties}>
      {dialog}
      <nav className="breadcrumbs" aria-label="Breadcrumb"><ol><li><Link href="/workspace/patients">Participants</Link></li><li><span aria-current="page">{p.displayId}</span></li></ol></nav>
      <div className="ws-detail">
        <aside className="card stack" aria-label="Participant summary">
          <div className="avatar avatar-lg" style={{ marginInline: "auto" }}>
            {data.photo ? (
              <a href={data.photo.fullUrl} target="_blank" rel="noopener" aria-label="Open full-size photo"><img src={data.photo.fullUrl} alt={`Identity photo of ${p.fullName}`} width={200} height={200} decoding="async" style={{ width: "100%", height: "100%", objectFit: "cover" }} /></a>
            ) : <span aria-hidden="true" style={{ fontSize: "3rem" }}>{p.fullName.slice(0, 1)}</span>}
          </div>
          <div style={{ textAlign: "center" }}>
            <h1 style={{ fontSize: "var(--step-2)", marginBottom: 4 }}>{p.fullName}</h1>
            <span className="copy-row" style={{ justifyContent: "center" }}><span className="code-chip">{p.displayId}</span><CopyButton value={p.displayId} what="Participant ID" /></span>
          </div>
          <dl className="dl">
            <dt>Status</dt><dd><span className="badge">{STATUS_LABELS[p.status]}</span></dd>
            <dt>Screening category</dt><dd>{p.groupCode ? <span className="badge badge-brand">Group {p.groupCode}</span> : "Not assigned"}</dd>
            <dt>Age</dt><dd>{p.age}</dd>
            <dt>Mobile</dt><dd>{p.mobile ?? "—"}</dd>
            <dt>Camp</dt><dd>{p.campName ?? "—"}</dd>
            <dt>Registered</dt><dd>{fmt(p.createdAt)} ({p.createdVia === "self" ? "self" : "camp"})</dd>
            <dt>Habit</dt><dd>{p.habitPresent === null ? "Unknown" : p.habitPresent ? "Present" : "None reported"}</dd>
          </dl>
          <div>
            <h2 style={{ fontSize: "var(--step-0)", fontFamily: "var(--font-sans)" }}>Consents</h2>
            <ul style={{ listStyle: "none", padding: 0, margin: 0 }} className="stack">
              {["registration", "screening", "photo", "followup_contact", "whatsapp_report", "clinical_photo"].map((t) => (
                <li key={t} className="cluster" style={{ justifyContent: "space-between" }}>
                  <span>{t.replace("_", " ")}</span>
                  <span className="cluster" style={{ gap: 6 }}>
                    <span className={`badge ${data.consents[t] === "granted" ? "badge-ok" : data.consents[t] === "withdrawn" ? "badge-danger" : ""}`}>{data.consents[t] ?? "not given"}</span>
                    {perms.clinical && data.consents[t] === "granted" && !withdrawn && <button className="linklike" style={{ fontSize: "0.85rem" }} onClick={() => withdraw(t, t.replace("_", " "))}>withdraw</button>}
                  </span>
                </li>
              ))}
            </ul>
          </div>
          {perms.clinical && !withdrawn && (
            <div className="cluster">
              <button className="btn btn-secondary btn-sm" disabled={data.checkedIn || !!busy} onClick={() => act("checkin", "checkin", {}, "Checked in")}>{data.checkedIn ? "Checked in ✓" : "Check in"}</button>
              {perms.photo && data.consents.photo === "granted" && <button className="btn btn-ghost btn-sm" onClick={() => setRetake((r) => !r)}>{data.photo ? "Retake photo" : "Take photo"}</button>}
            </div>
          )}
          {retake && <CameraCapture uploadUrl={`/api/patients/${p.id}/photo`} subjectLabel="the participant" onUploaded={() => { setRetake(false); toast("Photo saved", "success"); router.refresh(); }} />}
        </aside>

        <div className="stack" style={{ "--stack": "20px", minWidth: 0 } as React.CSSProperties}>
          <section className="card" aria-labelledby="q-h">
            <h2 id="q-h" style={{ fontSize: "var(--step-1)" }}>1. Questionnaire <span className="badge">{data.questionnaire.status.replace("_", " ")}</span></h2>
            {data.questionnaire.status === "completed" ? (
              <dl className="dl">
                {data.questionnaire.items.map((it) => {
                  const q = PROTOCOL.questions.find((x) => x.id === it.questionId);
                  const vals = Array.isArray(it.answer) ? it.answer : [it.answer];
                  return <div key={it.questionId} style={{ display: "contents" }}><dt>{it.questionText}</dt><dd>{vals.map((v) => q?.options.find((o) => o.value === v)?.label ?? String(v)).join(", ")}</dd></div>;
                })}
              </dl>
            ) : perms.clinical && !withdrawn ? (
              <>
                <p className="hint">Assist the participant: read each question aloud and record their own answers.</p>
                <Questionnaire endpoint={`/api/patients/${p.id}/questionnaire`} initial={data.questionnaire.answers} onCompleted={() => { toast("Questionnaire completed", "success"); router.refresh(); }} />
              </>
            ) : <p>Not completed yet.</p>}
          </section>

          {perms.clinical && <ExamSection patientId={p.id} latest={latestExam} disabled={withdrawn} onSaved={() => router.refresh()} onVerify={verify} busy={busy === "verify"} />}

          {perms.clinicalImages && <LesionImagesPanel key={`${latestExam?.id}-${latestExam?.status}-${latestExam?.lesion_present}`} patientId={p.id} disabled={withdrawn} />}

          <section className="card" aria-labelledby="c-h">
            <h2 id="c-h" style={{ fontSize: "var(--step-1)" }}>3. Screening category</h2>
            {data.classification && latestExam?.status === "verified" ? (
              <>
                <p><span className="group-badge">Group {data.classification.group_code}</span></p>
                <p><strong>Pathway:</strong> {data.classification.pathway}</p>
                <p className="hint">Programme screening category — not a diagnosis.</p>
              </>
            ) : latestExam?.status === "verified" ? (
              <p className="callout callout-warn">{latestExam.lesion_present === "uncertain" ? CLASSIFICATION_BLOCK_MESSAGES.lesion_uncertain : latestExam.exam_completed !== "yes" ? CLASSIFICATION_BLOCK_MESSAGES.exam_incomplete : CLASSIFICATION_BLOCK_MESSAGES.questionnaire_incomplete}</p>
            ) : <p>Assigned automatically after the questionnaire is complete and the examination is verified.</p>}
          </section>

          <section className="card" aria-labelledby="r-h">
            <h2 id="r-h" style={{ fontSize: "var(--step-1)" }}>4. Report</h2>
            {data.reports.length > 0 && (
              <ul>{data.reports.map((r) => <li key={r.id}><Link href={`/workspace/reports/${r.id}`}>Report v{r.version}</Link> — {fmt(r.created_at)}</li>)}</ul>
            )}
            {perms.clinical && (
              <div className="cluster">
                <button className="btn btn-primary btn-sm" disabled={!data.classification || latestExam?.status !== "verified" || !!busy} onClick={() => act("report", "report", {}, "Report generated")}>Generate report</button>
                {perms.whatsapp && data.reports[0] && (
                  <button className="btn btn-ghost btn-sm" disabled={!!busy} onClick={async () => {
                    const ok = await confirm({ title: "Send report via WhatsApp?", body: "The report will be submitted to the WhatsApp provider. Status will show “submitted” until the provider confirms delivery.", confirmLabel: "Submit to WhatsApp" });
                    if (ok) await act("whatsapp", "whatsapp", { reportId: data.reports[0]!.id, idempotencyKey: newKey() }, "Submitted to WhatsApp");
                  }}>Send via WhatsApp</button>
                )}
              </div>
            )}
          </section>

          {perms.clinical && data.classification && <FollowUpSection patientId={p.id} onSaved={() => router.refresh()} />}

          <section className="card" aria-labelledby="t-h">
            <h2 id="t-h" style={{ fontSize: "var(--step-1)" }}>Timeline</h2>
            {data.timeline.length === 0 ? <p>No events.</p> : (
              <ol className="timeline">{data.timeline.map((t, i) => <li key={i}><strong>{t.label}</strong><br /><span className="hint">{fmt(t.at)}{t.by ? ` · ${t.by}` : ""}</span></li>)}</ol>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}

function ExamSection({ patientId, latest, disabled, onSaved, onVerify, busy }: { patientId: string; latest?: Exam; disabled: boolean; onSaved: () => void; onVerify: () => void; busy: boolean }) {
  const toast = useToast();
  const verified = latest?.status === "verified";
  const [editing, setEditing] = useState(!latest);
  const [f, setF] = useState(() => ({
    examCompleted: latest?.exam_completed ?? "yes",
    mouthOpening: latest?.mouth_opening ?? "",
    interIncisorMm: latest?.inter_incisor_mm ?? "",
    oralFindings: latest?.oral_findings ?? [],
    lesionSites: latest?.lesion_sites ?? [],
    lesionPresent: latest?.lesion_present ?? "",
    clinicalImpression: latest?.clinical_impression ?? "",
    notes: latest?.notes ?? "",
    correctionReason: "",
  }));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const toggle = (k: "oralFindings" | "lesionSites", v: string) => setF((x) => {
    const set = new Set(x[k]);
    if (set.has(v)) set.delete(v);
    else if (k === "oralFindings" && v === "no_abnormality") return { ...x, oralFindings: ["no_abnormality"] };
    else { set.add(v); if (k === "oralFindings") set.delete("no_abnormality"); }
    return { ...x, [k]: [...set] };
  });

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setErrors({});
    try {
      await postJson(`/api/patients/${patientId}/exam`, {
        examCompleted: f.examCompleted,
        mouthOpening: f.mouthOpening || null,
        interIncisorMm: f.interIncisorMm === "" ? null : Number(f.interIncisorMm),
        oralFindings: f.oralFindings,
        lesionSites: f.lesionSites,
        lesionPresent: f.lesionPresent || null,
        clinicalImpression: f.clinicalImpression || null,
        notes: f.notes || null,
        ...(verified ? { correctionReason: f.correctionReason } : {}),
      });
      toast(verified ? "Correction saved as a new draft version" : "Examination saved as draft", "success");
      setEditing(false);
      onSaved();
    } catch (err) {
      const a = err as ApiError;
      if (a.fields) setErrors(a.fields);
      toast(a.message, "error");
    } finally {
      setSaving(false);
    }
  };

  const e = (k: string) => errors[k] && <p className="field-error">{errors[k]}</p>;
  const completed = f.examCompleted === "yes";
  return (
    <section className="card" aria-labelledby="e-h">
      <h2 id="e-h" style={{ fontSize: "var(--step-1)" }}>2. Oral examination {latest && <span className={`badge ${verified ? "badge-ok" : "badge-warn"}`}>v{latest.version} {latest.status}</span>}</h2>
      {latest && !editing && (
        <>
          <dl className="dl">
            <dt>Completed</dt><dd>{latest.exam_completed === "yes" ? "Yes" : "Unable / refused"}</dd>
            <dt>Mouth opening</dt><dd>{latest.mouth_opening ?? "—"}{latest.inter_incisor_mm ? ` (${latest.inter_incisor_mm} mm)` : ""}</dd>
            <dt>Findings</dt><dd>{latest.oral_findings.map((x) => label(ORAL_FINDINGS, x)).join(", ") || "—"}</dd>
            <dt>Site</dt><dd>{latest.lesion_sites.map((x) => label(LESION_SITES, x)).join(", ") || "—"}</dd>
            <dt>Lesion present</dt><dd>{latest.lesion_present ?? "—"}</dd>
            <dt>Impression</dt><dd>{label(CLINICAL_IMPRESSIONS, latest.clinical_impression)}</dd>
            {latest.notes && <><dt>Notes (restricted)</dt><dd>{latest.notes}</dd></>}
            <dt>Recorded</dt><dd>{latest.recorded_by_name}, {fmt(latest.recorded_at)}</dd>
            {latest.verified_at && <><dt>Verified</dt><dd>{latest.verified_by_name}, {fmt(latest.verified_at)}</dd></>}
            {latest.correction_reason && <><dt>Correction reason</dt><dd>{latest.correction_reason}</dd></>}
          </dl>
          {!disabled && (
            <div className="cluster" style={{ marginTop: 12 }}>
              {!verified && <button className="btn btn-primary btn-sm" onClick={onVerify} disabled={busy}>Verify examination</button>}
              <button className="btn btn-ghost btn-sm" onClick={() => setEditing(true)}>{verified ? "Record a correction" : "Edit draft"}</button>
            </div>
          )}
        </>
      )}
      {editing && !disabled && (
        <form onSubmit={save} noValidate>
          {verified && (
            <div className="field">
              <label htmlFor="ex-reason">Correction reason <span className="req">*</span><span className="hint">The verified version stays in history unchanged.</span></label>
              <input id="ex-reason" type="text" maxLength={500} value={f.correctionReason} onChange={(ev) => setF({ ...f, correctionReason: ev.target.value })} aria-invalid={!!errors.correctionReason} />
              {e("correctionReason")}
            </div>
          )}
          <fieldset>
            <legend>Examination completed</legend>
            <div className="choice-grid">
              {[["yes", "Yes"], ["unable_or_refused", "Unable / refused"]].map(([v, l]) => (
                <label key={v} className="choice"><input type="radio" name="examCompleted" checked={f.examCompleted === v} onChange={() => setF({ ...f, examCompleted: v! })} /> {l}</label>
              ))}
            </div>
          </fieldset>
          {completed && (
            <>
              <div className="form-row">
                <div className="field">
                  <label htmlFor="ex-mo">Mouth opening</label>
                  <select id="ex-mo" value={f.mouthOpening} onChange={(ev) => setF({ ...f, mouthOpening: ev.target.value })} aria-invalid={!!errors.mouthOpening}>
                    <option value="">Choose…</option><option value="normal">Normal</option><option value="restricted">Restricted</option>
                  </select>
                  {e("mouthOpening")}
                </div>
                <div className="field">
                  <label htmlFor="ex-mm">Inter-incisor distance (mm) <span className="opt">if indicated</span></label>
                  <input id="ex-mm" type="number" inputMode="decimal" min={0} max={90} step={0.5} value={f.interIncisorMm} onChange={(ev) => setF({ ...f, interIncisorMm: ev.target.value })} />
                </div>
              </div>
              <fieldset aria-invalid={!!errors.oralFindings}>
                <legend>Oral findings</legend>
                <div className="choice-grid">{ORAL_FINDINGS.map((o) => <label key={o.value} className="choice"><input type="checkbox" checked={f.oralFindings.includes(o.value)} onChange={() => toggle("oralFindings", o.value)} /> {o.label}</label>)}</div>
                {e("oralFindings")}
              </fieldset>
              <fieldset aria-invalid={!!errors.lesionSites}>
                <legend>Lesion site</legend>
                <div className="choice-grid">{LESION_SITES.map((o) => <label key={o.value} className="choice"><input type="checkbox" checked={f.lesionSites.includes(o.value)} onChange={() => toggle("lesionSites", o.value)} /> {o.label}</label>)}</div>
                {e("lesionSites")}
              </fieldset>
              <div className="form-row">
                <div className="field">
                  <label htmlFor="ex-lp">Lesion present (for classification)</label>
                  <select id="ex-lp" value={f.lesionPresent} onChange={(ev) => setF({ ...f, lesionPresent: ev.target.value })} aria-invalid={!!errors.lesionPresent}>
                    <option value="">Choose…</option><option value="no">No</option><option value="yes">Yes</option><option value="uncertain">Uncertain — refer</option>
                  </select>
                  {e("lesionPresent")}
                </div>
                <div className="field">
                  <label htmlFor="ex-ci">Clinical impression</label>
                  <select id="ex-ci" value={f.clinicalImpression} onChange={(ev) => setF({ ...f, clinicalImpression: ev.target.value })} aria-invalid={!!errors.clinicalImpression}>
                    <option value="">Choose…</option>
                    {CLINICAL_IMPRESSIONS.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
                  </select>
                  {e("clinicalImpression")}
                </div>
              </div>
            </>
          )}
          <div className="field">
            <label htmlFor="ex-notes">Clinical notes <span className="opt">(restricted; never exported)</span></label>
            <textarea id="ex-notes" maxLength={2000} value={f.notes} onChange={(ev) => setF({ ...f, notes: ev.target.value })} />
          </div>
          <div className="cluster">
            <button className="btn btn-primary" disabled={saving}>{saving ? "Saving…" : "Save draft"}</button>
            {latest && <button type="button" className="btn btn-ghost" onClick={() => setEditing(false)}>Cancel</button>}
          </div>
        </form>
      )}
    </section>
  );
}

function FollowUpSection({ patientId, onSaved }: { patientId: string; onSaved: () => void }) {
  const toast = useToast();
  const [f, setF] = useState({ referralRequired: "no", referralDestination: "", followUpRequired: false, dueDate: "", cessationOutcome: "" });
  const [saving, setSaving] = useState(false);
  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await postJson(`/api/patients/${patientId}/followup`, {
        referralRequired: f.referralRequired, referralDestination: f.referralDestination || null, followUpRequired: f.followUpRequired,
        dueDate: f.dueDate || null, cessationOutcome: f.cessationOutcome || null,
      });
      toast("Follow-up recorded", "success");
      onSaved();
    } catch (err) {
      toast((err as ApiError).message, "error");
    } finally {
      setSaving(false);
    }
  };
  return (
    <section className="card" aria-labelledby="f-h">
      <h2 id="f-h" style={{ fontSize: "var(--step-1)" }}>5. Referral &amp; follow-up</h2>
      <form onSubmit={save} noValidate>
        <div className="form-row">
          <div className="field"><label htmlFor="f-ref">Referral</label>
            <select id="f-ref" value={f.referralRequired} onChange={(e) => setF({ ...f, referralRequired: e.target.value })}>
              <option value="no">Not required</option><option value="planned_routine">Planned / routine</option><option value="priority">Priority</option>
            </select></div>
          <div className="field"><label htmlFor="f-dest">Destination</label>
            <select id="f-dest" value={f.referralDestination} onChange={(e) => setF({ ...f, referralDestination: e.target.value })}>
              <option value="">—</option><option value="government_hospital">Government hospital</option><option value="haoc_specialist">Programme specialist pathway</option><option value="preferred_doctor">Participant&apos;s preferred doctor</option><option value="other">Other</option>
            </select></div>
        </div>
        <div className="form-row">
          <div className="field"><label className="choice"><input type="checkbox" checked={f.followUpRequired} onChange={(e) => setF({ ...f, followUpRequired: e.target.checked })} /> Follow-up required</label></div>
          <div className="field"><label htmlFor="f-due">Follow-up due date</label><input id="f-due" type="date" value={f.dueDate} onChange={(e) => setF({ ...f, dueDate: e.target.value })} /></div>
        </div>
        <div className="field"><label htmlFor="f-cess">Cessation</label>
          <select id="f-cess" value={f.cessationOutcome} onChange={(e) => setF({ ...f, cessationOutcome: e.target.value })}>
            <option value="">—</option><option value="interested_referred">Interested / referred</option><option value="not_interested">Not interested</option><option value="not_applicable">Not applicable</option><option value="unknown">Unknown</option>
          </select></div>
        <button className="btn btn-primary btn-sm" disabled={saving}>{saving ? "Saving…" : "Record follow-up"}</button>
      </form>
    </section>
  );
}
