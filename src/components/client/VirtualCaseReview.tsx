"use client";
import Link from "next/link";
import { useCallback, useRef, useState } from "react";
import { CaseTimeline, type TimelineItem } from "@/components/CaseTimeline";
import { PROTOCOL } from "@/lib/shared/protocol";
import { FOLLOWUP_ACTIONS, MOUTH_VIEWS, NOTIFICATION_TEMPLATES, REVIEW_OUTCOMES, renderTemplate, type NotificationTemplate } from "@/lib/shared/virtual";
import { getJson, postJson, type ApiError } from "./api";
import { useConfirm } from "./ConfirmDialog";
import { useToast } from "./Toaster";

type Img = {
  id: string; view: string; viewLabel: string; round: number; current: boolean; capturedBy: string; flags: string[]; quality: { brightness: number; sharpness: number };
  width: number; height: number; submitted: boolean; reviewStatus: "pending" | "acceptable" | "needs_retake"; reviewNote: string | null; reviewedBy: string | null;
  reviewedAt: string | null; uploadedAt: string; previewUrl: string; fullUrl: string;
};
export type CaseData = {
  case: { id: string; status: string; statusLabel: string; round: number; submittedAt: string | null; assistanceRequestedAt: string | null; assistanceNote: string | null;
    outcome: string | null; outcomeNotes: string | null; nextSteps: string | null; lesionLocation: string | null; reviewedAt: string | null; reviewedBy: string | null; canDecide: boolean };
  patient: { displayId: string; fullName: string; age: number; mobile: string | null; driverType: string; district: string | null; mandal: string | null; pincode: string | null;
    addressLine: string | null; language: string; registeredAt: string; notificationsConsent: boolean; withdrawn: boolean };
  questionnaire: { status: string; items: { questionId: string; questionText: string; answer: unknown }[] };
  imagesHidden: boolean;
  images: Img[];
  reviews: { id: string; round: number; decision: string; inconclusive_action: string | null; notes: string | null; next_steps: string | null; lesion_location: string | null; created_at: string; reviewer: string }[];
  followups: { id: string; action: string; note: string | null; created_at: string; by: string }[];
  notifications: { id: string; template: string; status: string; attempts: number; last_error: string | null; created_at: string; updated_at: string }[];
  timeline: TimelineItem[];
  tutorial: { completedAt: string | null; language: string | null; version: string | null };
  /** False during a pilot without WhatsApp: no message can reach the participant, doctors phone instead. */
  messagingAvailable: boolean;
};

const fmt = (d: string | null) => (d ? new Date(d).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Kolkata" }) : "—");
const FLAG_LABEL: Record<string, string> = { too_dark: "Dark", too_bright: "Overexposed", blurry: "Blurry" };
const DECISIONS = [
  ...REVIEW_OUTCOMES.map((o) => ({ value: o.value, label: o.label })),
  { value: "more_images", label: "Ask for clearer photos (no outcome yet)" },
] as const;

function answerLabel(qid: string, answer: unknown): string {
  const q = PROTOCOL.questions.find((x) => x.id === qid);
  const label = (v: string) => q?.options.find((o) => o.value === v)?.label ?? v;
  return Array.isArray(answer) ? answer.map((a) => label(String(a))).join(", ") : label(String(answer ?? ""));
}

/** Doctor's review screen: details and answers on one side, every photo shown directly on the other. */
export function VirtualCaseReview({ initial }: { initial: CaseData }) {
  const [data, setData] = useState(initial);
  const [zoom, setZoom] = useState<Img | null>(null);
  const [zoomed, setZoomed] = useState(false);
  const [notesFor, setNotesFor] = useState<Record<string, string>>({});
  const [decision, setDecision] = useState("");
  const [inconclusiveAction, setInconclusiveAction] = useState<"more_images" | "in_person">("in_person");
  const [notes, setNotes] = useState("");
  const [nextSteps, setNextSteps] = useState("");
  const [lesionLocation, setLesionLocation] = useState("");
  const [fu, setFu] = useState({ action: "called", note: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const zoomRef = useRef<HTMLDialogElement>(null);
  const { confirm, dialog } = useConfirm();
  const toast = useToast();

  const reload = useCallback(async () => setData(await getJson<CaseData>(`/api/virtual/cases/${initial.case.id}`)), [initial.case.id]);
  const c = data.case;
  const p = data.patient;
  const current = data.images.filter((i) => i.current);
  const earlier = data.images.filter((i) => !i.current);
  const order = (v: string) => MOUTH_VIEWS.findIndex((m) => m.value === v);
  current.sort((a, b) => order(a.view) - order(b.view));
  const reviewable = c.canDecide;

  const openZoom = (img: Img) => {
    setZoom(img);
    setZoomed(false);
    requestAnimationFrame(() => zoomRef.current?.showModal());
  };

  const markImage = async (img: Img, d: "acceptable" | "needs_retake") => {
    try {
      await postJson(`/api/virtual/images/${img.id}/review`, { decision: d, note: d === "needs_retake" ? notesFor[img.id]?.trim() || undefined : undefined });
      await reload();
    } catch (e) {
      toast((e as ApiError).message, "error");
    }
  };

  const templateFor = (): NotificationTemplate => (decision === "more_images" || (decision === "inconclusive" && inconclusiveAction === "more_images") ? "review_more_images" : decision === "no_suspicious" ? "review_no_lesion" : "review_suspicious");

  const submitDecision = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!decision) return setError("Choose an outcome.");
    const t = templateFor();
    const message = renderTemplate(t, { name: p.fullName.split(" ")[0]!, clinic: "[clinic]", phone: "[phone]", id: p.displayId });
    const ok = await confirm({
      title: "Record this review?",
      body: `${DECISIONS.find((d) => d.value === decision)?.label}. ${!data.messagingAvailable ? "Messaging is not switched on yet, so no message will be sent — please phone the participant with this result and record the call below." : p.notificationsConsent && p.mobile ? `The participant will receive this message: “${message}”` : "No message will be sent (no consent or mobile number) — please contact the participant directly."}`,
      confirmLabel: "Record review",
    });
    if (!ok) return;
    setBusy(true);
    setError("");
    try {
      const extra = { notes: notes.trim() || undefined, nextSteps: nextSteps.trim() || undefined, lesionLocation: lesionLocation.trim() || undefined };
      const body = decision === "more_images" ? { decision, notes: notes.trim() || undefined }
        : decision === "inconclusive" ? { decision, inconclusiveAction, ...extra }
        : { decision, ...extra };
      const r = await postJson<{ notification: { queued?: string; skipped?: string } }>(`/api/virtual/cases/${c.id}/decision`, body);
      toast(r.notification.queued ? "Review recorded. The message is being sent." : "Review recorded. No message was sent — contact the participant directly.", "success");
      setDecision("");
      setNotes("");
      setNextSteps("");
      setLesionLocation("");
      await reload();
    } catch (err) {
      setError((err as ApiError).message);
    } finally {
      setBusy(false);
    }
  };

  const addFollowup = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await postJson(`/api/virtual/cases/${c.id}/followup`, { action: fu.action, note: fu.note.trim() || undefined });
      setFu({ action: "called", note: "" });
      toast("Follow-up recorded.", "success");
      await reload();
    } catch (err) {
      toast((err as ApiError).message, "error");
    }
  };

  const retry = async (id: string) => {
    try {
      await postJson(`/api/notifications/${id}/retry`, {});
      toast("Message queued again.", "success");
      setTimeout(() => void reload(), 1500);
    } catch (err) {
      toast((err as ApiError).message, "error");
    }
  };

  const imageCard = (img: Img) => (
    <figure key={img.id} className={`vr-img is-${img.reviewStatus}`}>
      <button type="button" className="vr-thumb" onClick={() => openZoom(img)} aria-label={`Open full-size photo: ${img.viewLabel}`}>
        <img src={img.previewUrl} alt={`${img.viewLabel} — participant photo`} loading="lazy" decoding="async" />
      </button>
      <figcaption>
        <strong>{img.viewLabel}</strong>
        <span className="hint">Round {img.round} · {img.capturedBy === "caregiver" ? "taken by a helper" : "taken by the participant"} · {img.width}×{img.height}</span>
        <span className="cluster" style={{ gap: 6 }}>
          {img.flags.map((f) => <span key={f} className="badge badge-warn">{FLAG_LABEL[f] ?? f}</span>)}
          <span className={`badge ${img.reviewStatus === "acceptable" ? "badge-ok" : img.reviewStatus === "needs_retake" ? "badge-danger" : ""}`}>
            {img.reviewStatus === "acceptable" ? "Acceptable" : img.reviewStatus === "needs_retake" ? "Clearer photo requested" : "Not reviewed"}
          </span>
        </span>
        {img.reviewNote && <span className="hint">Note: {img.reviewNote}</span>}
        {reviewable && img.current && img.submitted && (
          <span className="vr-img-actions">
            <button type="button" className="btn btn-sm btn-primary" aria-pressed={img.reviewStatus === "acceptable"} onClick={() => void markImage(img, "acceptable")}>✓ Acceptable</button>
            <input aria-label={`Why a clearer photo is needed: ${img.viewLabel}`} placeholder="Reason (optional)" maxLength={500} value={notesFor[img.id] ?? ""} onChange={(e) => setNotesFor((n) => ({ ...n, [img.id]: e.target.value }))} />
            <button type="button" className="btn btn-sm btn-secondary" aria-pressed={img.reviewStatus === "needs_retake"} onClick={() => void markImage(img, "needs_retake")}>Need clearer image</button>
          </span>
        )}
      </figcaption>
    </figure>
  );

  return (
    <div className="stack" style={{ "--stack": "20px" } as React.CSSProperties}>
      {dialog}
      <nav className="breadcrumbs" aria-label="Breadcrumb"><ol><li><Link href="/workspace/virtual">Virtual review</Link></li><li><span aria-current="page">{p.displayId}</span></li></ol></nav>
      <div className="cluster" style={{ justifyContent: "space-between" }}>
        <div>
          <h1 style={{ fontSize: "var(--step-3)", margin: 0 }}>{p.fullName}</h1>
          <p className="hint" style={{ margin: "4px 0 0" }}><span className="code-chip">{p.displayId}</span> · Age {p.age} · Submitted {fmt(c.submittedAt)}{c.round > 1 ? ` · round ${c.round}` : ""}</p>
        </div>
        <span className="cluster" style={{ gap: 6 }}>
          <span className="badge badge-brand">{c.statusLabel}</span>
          {c.assistanceRequestedAt && <span className="badge badge-warn">Help requested</span>}
        </span>
      </div>
      {c.assistanceRequestedAt && <div className="callout callout-warn"><strong>The participant asked for help</strong> ({fmt(c.assistanceRequestedAt)}){c.assistanceNote ? `: “${c.assistanceNote}”` : ""}. Consider calling them on {p.mobile ?? "—"}.</div>}
      <p className="hint" style={{ margin: 0 }}>Photo review is a screening step. It cannot confirm or rule out cancer; no software interprets these images.</p>

      <div className="vr-layout">
        <aside className="stack" style={{ "--stack": "16px" } as React.CSSProperties}>
          <section className="card">
            <h2 className="vr-h">Participant</h2>
            <dl className="dl">
              <dt>Mobile</dt><dd>{p.mobile ?? "—"}</dd>
              <dt>District</dt><dd>{p.district ?? "—"}</dd>
              <dt>Mandal / area</dt><dd>{p.mandal ?? "—"}</dd>
              <dt>PIN code</dt><dd>{p.pincode ?? "—"}</dd>
              <dt>Address</dt><dd>{p.addressLine ?? "—"}</dd>
              <dt>Language</dt><dd>{p.language}</dd>
              <dt>Registered</dt><dd>{fmt(p.registeredAt)}</dd>
              <dt>Messages</dt><dd>{!data.messagingAvailable ? "Messaging not switched on — phone every result" : p.notificationsConsent ? "WhatsApp consented" : "No message consent — call instead"}</dd>
              <dt>Photo guide</dt><dd>{data.tutorial.completedAt ? `Watched (${data.tutorial.language}, version ${data.tutorial.version})` : "Not watched"}</dd>
            </dl>
          </section>
          <section className="card"><CaseTimeline events={data.timeline} title="Timeline" /></section>
          <section className="card">
            <h2 className="vr-h">Questionnaire</h2>
            {data.questionnaire.items.length === 0 ? <p className="hint">Not answered.</p> : (
              <dl className="vr-answers">
                {data.questionnaire.items.map((q) => <div key={q.questionId}><dt>{q.questionText}</dt><dd>{answerLabel(q.questionId, q.answer)}</dd></div>)}
              </dl>
            )}
          </section>
        </aside>

        <div className="stack" style={{ "--stack": "20px" } as React.CSSProperties}>
          <section aria-labelledby="photos-h">
            <h2 id="photos-h" className="vr-h">Photos ({current.length})</h2>
            {data.imagesHidden ? <p className="callout">The participant withdrew consent for their photos, so they are hidden.</p>
              : current.length === 0 ? <p className="hint">No photos yet.</p>
              : <div className="vr-gallery">{current.map(imageCard)}</div>}
            {earlier.length > 0 && (
              <details style={{ marginTop: 12 }}>
                <summary>Earlier photos ({earlier.length})</summary>
                <div className="vr-gallery" style={{ marginTop: 12 }}>{earlier.map(imageCard)}</div>
              </details>
            )}
          </section>

          {reviewable && (
            <section className="card" aria-labelledby="decide-h">
              <h2 id="decide-h" className="vr-h">Record the review</h2>
              <form onSubmit={submitDecision} className="stack" style={{ "--stack": "12px" } as React.CSSProperties}>
                <fieldset>
                  <legend>Outcome</legend>
                  {DECISIONS.map((d) => (
                    <label key={d.value} className="choice"><input type="radio" name="decision" value={d.value} checked={decision === d.value} onChange={() => setDecision(d.value)} /><span>{d.label}</span></label>
                  ))}
                </fieldset>
                {decision === "inconclusive" && (
                  <fieldset>
                    <legend>What is needed?</legend>
                    <label className="choice"><input type="radio" name="inc" checked={inconclusiveAction === "in_person"} onChange={() => setInconclusiveAction("in_person")} /><span>An in-person examination</span></label>
                    <label className="choice"><input type="radio" name="inc" checked={inconclusiveAction === "more_images"} onChange={() => setInconclusiveAction("more_images")} /><span>Further photos</span></label>
                  </fieldset>
                )}
                {decision !== "more_images" && decision !== "no_suspicious" && (
                  <div className="field"><label htmlFor="vr-loc">Location of the suspicious area <span className="opt">(e.g. left buccal mucosa, lateral tongue)</span></label><input id="vr-loc" maxLength={200} value={lesionLocation} onChange={(e) => setLesionLocation(e.target.value)} /></div>
                )}
                <div className="field"><label htmlFor="vr-notes">Clinical observations <span className="opt">(not shared with the participant)</span></label><textarea id="vr-notes" rows={3} maxLength={4000} value={notes} onChange={(e) => setNotes(e.target.value)} /></div>
                {decision !== "more_images" && <div className="field"><label htmlFor="vr-next">Recommended next steps</label><textarea id="vr-next" rows={2} maxLength={2000} value={nextSteps} onChange={(e) => setNextSteps(e.target.value)} /></div>}
                {decision && <p className="hint" style={{ margin: 0 }}>Message to the participant: <em>{NOTIFICATION_TEMPLATES[templateFor()].label}</em></p>}
                {error && <p className="field-error" role="alert">{error}</p>}
                <div><button className="btn btn-primary" type="submit" disabled={busy || !decision}>{busy ? "Saving…" : "Record review"}</button></div>
              </form>
            </section>
          )}

          {c.outcome && (
            <section className="card" aria-labelledby="out-h">
              <h2 id="out-h" className="vr-h">Review outcome</h2>
              <p style={{ margin: 0 }}><strong>{REVIEW_OUTCOMES.find((o) => o.value === c.outcome)?.label}</strong></p>
              <p className="hint">By {c.reviewedBy ?? "—"} on {fmt(c.reviewedAt)}</p>
              {c.lesionLocation && <p><strong>Location:</strong> {c.lesionLocation}</p>}
              {c.outcomeNotes && <p><strong>Observations:</strong> {c.outcomeNotes}</p>}
              {c.nextSteps && <p><strong>Next steps:</strong> {c.nextSteps}</p>}
            </section>
          )}

          <section className="card" aria-labelledby="msg-h">
            <h2 id="msg-h" className="vr-h">Messages to the participant</h2>
            {data.notifications.length === 0 ? <p className="hint" style={{ margin: 0 }}>None yet.</p> : (
              <ul className="vr-list">
                {data.notifications.map((n) => (
                  <li key={n.id}>
                    <span>{NOTIFICATION_TEMPLATES[n.template as NotificationTemplate]?.label ?? n.template}</span>
                    <span className={`badge ${n.status === "failed" ? "badge-danger" : ["delivered", "read"].includes(n.status) ? "badge-ok" : ""}`}>{n.status === "read" ? "Read" : n.status === "delivered" ? "Delivered" : n.status === "sent" ? "Sent" : n.status === "failed" ? "Failed" : "Sending"}</span>
                    <span className="hint">{fmt(n.updated_at)}{n.attempts > 1 ? ` · ${n.attempts} attempts` : ""}{n.last_error ? ` · ${n.last_error}` : ""}</span>
                    {n.status === "failed" && <button type="button" className="btn btn-sm btn-secondary" onClick={() => void retry(n.id)}>Resend</button>}
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="card" aria-labelledby="fu-h">
            <h2 id="fu-h" className="vr-h">Follow-up</h2>
            <form onSubmit={addFollowup} className="cluster" style={{ alignItems: "end" }}>
              <div className="field" style={{ flex: "0 1 240px" }}><label htmlFor="fu-action">Action</label>
                <select id="fu-action" value={fu.action} onChange={(e) => setFu((f) => ({ ...f, action: e.target.value }))}>{FOLLOWUP_ACTIONS.map((a) => <option key={a.value} value={a.value}>{a.label}</option>)}</select></div>
              <div className="field" style={{ flex: "1 1 240px" }}><label htmlFor="fu-note">Note</label><input id="fu-note" maxLength={1000} value={fu.note} onChange={(e) => setFu((f) => ({ ...f, note: e.target.value }))} /></div>
              <button className="btn btn-secondary" type="submit">Add</button>
            </form>
            {data.followups.length > 0 && (
              <ul className="vr-list" style={{ marginTop: 12 }}>
                {data.followups.map((f) => <li key={f.id}><span>{FOLLOWUP_ACTIONS.find((a) => a.value === f.action)?.label ?? f.action}</span><span className="hint">{f.note ?? ""}</span><span className="hint">{f.by} · {fmt(f.created_at)}</span></li>)}
              </ul>
            )}
          </section>

          {data.reviews.length > 0 && (
            <section className="card" aria-labelledby="hist-h">
              <h2 id="hist-h" className="vr-h">Review history</h2>
              <ul className="vr-list">
                {data.reviews.map((r) => <li key={r.id}><span>Round {r.round}: {DECISIONS.find((d) => d.value === r.decision)?.label ?? r.decision}{r.inconclusive_action ? ` (${r.inconclusive_action === "in_person" ? "in-person examination" : "further photos"})` : ""}{r.lesion_location ? ` — ${r.lesion_location}` : ""}</span><span className="hint">{r.reviewer} · {fmt(r.created_at)}</span></li>)}
              </ul>
            </section>
          )}
        </div>
      </div>

      <dialog ref={zoomRef} className="vr-zoom" aria-label={zoom ? `${zoom.viewLabel}, full size` : "Photo"} onClose={() => setZoom(null)}>
        {zoom && (
          <>
            <div className="vr-zoom-bar">
              <strong>{zoom.viewLabel}</strong>
              <span className="cluster">
                <button type="button" className="btn btn-sm btn-secondary" onClick={() => setZoomed((z) => !z)}>{zoomed ? "Fit to screen" : "Actual size"}</button>
                <button type="button" className="btn btn-sm btn-primary" onClick={() => zoomRef.current?.close()} autoFocus>Close</button>
              </span>
            </div>
            <div className={`vr-zoom-body ${zoomed ? "is-zoomed" : ""}`}><img src={zoom.fullUrl} alt={`${zoom.viewLabel} — full size`} /></div>
          </>
        )}
      </dialog>
    </div>
  );
}
