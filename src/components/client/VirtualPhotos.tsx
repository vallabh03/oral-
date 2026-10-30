"use client";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { VIEW_CLIP } from "@/lib/shared/tutorial";
import { MOUTH_VIEWS, type MouthView } from "@/lib/shared/virtual";
import { MouthDiagram } from "@/components/MouthDiagram";
import { getJson, postJson, sendJson, type ApiError } from "./api";
import { checkPhoto, FLAG_MESSAGES, type ClientFlag } from "./photoQuality";
import { TutorialClip, TutorialGate } from "./TutorialClip";
import { CaseTimeline, type TimelineItem } from "@/components/CaseTimeline";

type CaseImage = { id: string; view: MouthView; flags: ClientFlag[]; submitted: boolean; retakeRequested: boolean; previewUrl: string };
type CaseData = {
  status: string; statusLabel: string; round: number; canEdit: boolean; imagesConsent: boolean; assistanceRequested: boolean;
  missingRecommended: MouthView[]; images: CaseImage[]; resultMessage: string | null; clinic: { name: string; phone: string };
  tutorial: { completedAt: string | null }; timeline: TimelineItem[]; submittedMessage: string | null;
};
type Pending = { file: File; url: string; flags: ClientFlag[] };
const MAX_BYTES = 15 * 1024 * 1024;

/** PUT with progress. App-hosted uploads carry an idempotency key; presigned S3 uploads send only the signed headers. */
function putFile(url: string, file: Blob, headers: Record<string, string>, onProgress: (p: number) => void): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", url);
    for (const [k, v] of Object.entries(headers)) xhr.setRequestHeader(k, v);
    xhr.timeout = 120_000;
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress(Math.round((e.loaded / e.total) * 100));
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) return resolve();
      let msg = "The upload did not complete. Please try again.";
      try { msg = JSON.parse(xhr.responseText)?.error?.message ?? msg; } catch {}
      reject(Object.assign(new Error(msg), { status: xhr.status }));
    };
    xhr.onerror = xhr.ontimeout = () => reject(Object.assign(new Error("The connection dropped. Check your signal and try again."), { status: 0 }));
    xhr.send(file);
  });
}

export function VirtualPhotos({ onSubmitted }: { onSubmitted?: () => void }) {
  const [data, setData] = useState<CaseData | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "expired" | "error">("loading");
  const [helper, setHelper] = useState(false);
  const [pending, setPending] = useState<Partial<Record<MouthView, Pending>>>({});
  const [busy, setBusy] = useState<Partial<Record<MouthView, number>>>({});
  const [errors, setErrors] = useState<Partial<Record<MouthView, string>>>({});
  const [notes, setNotes] = useState<Partial<Record<MouthView, string[]>>>({});
  const [submitError, setSubmitError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [helpNote, setHelpNote] = useState("");
  const [helpSent, setHelpSent] = useState(false);
  const topRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    try {
      setData(await getJson<CaseData>("/api/intake/virtual"));
      setState("ready");
    } catch (e) {
      setState((e as ApiError).status === 401 ? "expired" : "error");
    }
  }, []);
  useEffect(() => { void load(); }, [load]);
  useEffect(() => () => Object.values(pending).forEach((p) => p && URL.revokeObjectURL(p.url)), []); // eslint-disable-line react-hooks/exhaustive-deps

  const choose = async (view: MouthView, file: File | undefined) => {
    if (!file) return;
    setErrors((e) => ({ ...e, [view]: undefined }));
    if (!/^image\/(jpeg|png|webp)$/.test(file.type)) {
      setErrors((e) => ({ ...e, [view]: "Please use a JPEG, PNG or WebP photo. On iPhone, set Settings › Camera › Formats to “Most Compatible”." }));
      return;
    }
    if (file.size > MAX_BYTES) {
      setErrors((e) => ({ ...e, [view]: "This photo is larger than 15 MB. Take it again with the normal camera setting." }));
      return;
    }
    const flags = await checkPhoto(file);
    setPending((p) => {
      if (p[view]) URL.revokeObjectURL(p[view]!.url);
      return { ...p, [view]: { file, url: URL.createObjectURL(file), flags } };
    });
  };

  const discard = (view: MouthView) => setPending((p) => {
    if (p[view]) URL.revokeObjectURL(p[view]!.url);
    const { [view]: _, ...rest } = p;
    return rest;
  });

  const upload = async (view: MouthView) => {
    const p = pending[view];
    if (!p) return;
    setBusy((b) => ({ ...b, [view]: 0 }));
    setErrors((e) => ({ ...e, [view]: undefined }));
    try {
      const t = await postJson<{ ticketId: string; uploadUrl: string; headers: Record<string, string>; direct: boolean }>("/api/intake/virtual/uploads", {
        view, contentType: p.file.type, bytes: p.file.size, capturedBy: helper ? "caregiver" : "patient",
      });
      const headers = t.direct ? t.headers : { ...t.headers, "idempotency-key": t.ticketId };
      // One automatic retry for a dropped connection; the same ticket is reused.
      try {
        await putFile(t.uploadUrl, p.file, headers, (pct) => setBusy((b) => ({ ...b, [view]: pct })));
      } catch (e) {
        if ((e as { status: number }).status !== 0) throw e;
        await putFile(t.uploadUrl, p.file, headers, (pct) => setBusy((b) => ({ ...b, [view]: pct })));
      }
      const r = await postJson<{ warnings: string[] }>(`/api/intake/virtual/uploads/${t.ticketId}/complete`, {});
      setNotes((n) => ({ ...n, [view]: r.warnings }));
      discard(view);
      await load();
    } catch (e) {
      setErrors((x) => ({ ...x, [view]: (e as Error).message }));
    } finally {
      setBusy((b) => {
        const { [view]: _, ...rest } = b;
        return rest;
      });
    }
  };

  const remove = async (img: CaseImage) => {
    try {
      await sendJson("DELETE", `/api/intake/virtual/images/${img.id}`, {});
      setNotes((n) => ({ ...n, [img.view]: [] }));
      await load();
    } catch (e) {
      setErrors((x) => ({ ...x, [img.view]: (e as Error).message }));
    }
  };

  const askHelp = async () => {
    try {
      await postJson("/api/intake/virtual/assistance", { note: helpNote.trim() || undefined });
      setHelpSent(true);
      await load();
    } catch (e) {
      setSubmitError((e as Error).message);
    }
  };

  const submit = async () => {
    setSubmitting(true);
    setSubmitError("");
    try {
      await postJson("/api/intake/virtual/submit", {});
      await load();
      onSubmitted?.();
      requestAnimationFrame(() => topRef.current?.focus());
    } catch (e) {
      setSubmitError((e as Error).message);
    } finally {
      setSubmitting(false);
    }
  };

  if (state === "loading") return <div className="skeleton" style={{ height: 220 }} aria-busy="true" aria-label="Loading your photos" />;
  if (state === "expired") {
    return (
      <div className="callout" role="status">
        <p style={{ marginTop: 0 }}>Your session has ended. Log in with your participant ID and mobile number to continue.</p>
        <Link className="btn btn-primary" href="/register/login">Log in</Link>
      </div>
    );
  }
  if (state === "error" || !data) return <div className="error-summary" role="alert"><p style={{ margin: 0 }}>We could not load your photos. Check your connection and try again.</p><button className="btn btn-primary btn-sm" style={{ marginTop: 8 }} onClick={() => void load()}>Try again</button></div>;

  const imagesFor = (v: MouthView) => data.images.filter((i) => i.view === v);
  const recommendedTotal = MOUTH_VIEWS.filter((v) => v.recommended).length;
  const recommendedDone = recommendedTotal - data.missingRecommended.length;

  if (!data.canEdit) {
    return (
      <div ref={topRef} tabIndex={-1} className="stack" style={{ "--stack": "16px", outline: "none" } as React.CSSProperties}>
        <div className="success-state" role="status">
          <h2 style={{ marginTop: 0 }}>{data.statusLabel}</h2>
          {data.resultMessage ? <p>{data.resultMessage}</p> : <p>{data.submittedMessage ?? "Thank you. A doctor will review your photos."}</p>}
          <p className="hint" style={{ marginBottom: 0 }}>Photo screening cannot rule out oral disease. If you have an ulcer, lump, red or white patch or bleeding that lasts more than two weeks, please see a doctor in person. Do not wait for our message.</p>
        </div>
        <div className="vp-thumbs" aria-label="Photos you sent">
          {data.images.map((i) => <img key={i.id} src={i.previewUrl} alt={`Your photo: ${MOUTH_VIEWS.find((v) => v.value === i.view)?.label}`} loading="lazy" />)}
        </div>
        <p className="hint">Questions? Contact {data.clinic.name} at {data.clinic.phone}.</p>
        <CaseTimeline events={data.timeline} title="Your progress" />
      </div>
    );
  }

  // Photo capture opens only after the guide has been watched to the end.
  if (!data.tutorial.completedAt) {
    return (
      <div ref={topRef} tabIndex={-1} className="stack" style={{ "--stack": "20px", outline: "none" } as React.CSSProperties}>
        <TutorialGate onDone={() => void load()} />
        <CaseTimeline events={data.timeline} title="Your progress" />
      </div>
    );
  }

  return (
    <div ref={topRef} tabIndex={-1} className="stack" style={{ "--stack": "20px", outline: "none" } as React.CSSProperties}>
      {data.status === "more_images_requested" && (
        <div className="callout callout-warn" role="status"><strong>The doctor needs clearer photos.</strong> Retake the areas marked below, then submit again.</div>
      )}
      <TutorialClip step="guide" label="Watch the photo guide again (English, తెలుగు, हिन्दी)" />
      <div className="callout">
        <strong>Before you start</strong>
        <ul style={{ margin: "8px 0 0" }}>
          <li>Use daylight from a window or a bright light. Avoid the flash if it makes the photo shiny.</li>
          <li>Rinse your mouth with water and remove dentures if you can.</li>
          <li>Hold the phone steady and tap the screen to focus before you take each photo.</li>
          <li>Keep your whole face out of the photo where possible. Only the mouth is needed.</li>
        </ul>
      </div>

      <fieldset className="vp-who">
        <legend>Who is taking the photos?</legend>
        <label><input type="radio" name="who" checked={!helper} onChange={() => setHelper(false)} /> I am (front camera)</label>
        <label><input type="radio" name="who" checked={helper} onChange={() => setHelper(true)} /> Someone is helping me (back camera, clearer)</label>
      </fieldset>

      <p className="vp-progress" role="status"><strong>{recommendedDone} of {recommendedTotal}</strong> recommended photos added · {data.images.length ? "you can submit whenever your photos look clear" : "add at least one photo to submit"}</p>

      <ol className="vp-list">
        {MOUTH_VIEWS.map((v, idx) => {
          const imgs = imagesFor(v.value);
          const current = v.value === "concern" ? undefined : imgs[0];
          const p = pending[v.value];
          const pct = busy[v.value];
          const retake = current?.retakeRequested;
          const canAddConcern = v.value === "concern" && imgs.length < 3;
          return (
            <li key={v.value} className={`vp-card ${retake ? "is-retake" : current ? "is-done" : ""}`}>
              <MouthDiagram view={v.value} />
              <div className="vp-body">
                <h3>
                  <span className="vp-num">{idx + 1}</span> {v.label}{" "}
                  <span className={`badge ${v.recommended ? "badge-brand" : ""}`}>{v.recommended ? "Recommended" : "Optional"}</span>
                  {current && !retake && <span className="badge badge-ok">Added ✓</span>}
                </h3>
                {retake && <p className="vp-alert" role="alert">The doctor asked for a clearer photo of this area. Please take it again.</p>}
                <ol className="vp-steps">{v.steps.map((s) => <li key={s}>{s}</li>)}</ol>
                {VIEW_CLIP[v.value] && <TutorialClip step={VIEW_CLIP[v.value]!} label={`Watch how (short video): ${v.label}`} />}

                {(v.value === "concern" ? imgs : current ? [current] : []).map((i) => (
                  <div key={i.id} className="vp-current">
                    <img src={i.previewUrl} alt={`Your photo: ${v.label}`} width={120} height={90} />
                    <div>
                      {(notes[v.value]?.length ? notes[v.value]! : i.flags.map((f) => FLAG_MESSAGES[f])).map((m) => <p key={m} className="vp-warn">{m}</p>)}
                      {!i.submitted && <button type="button" className="btn btn-ghost btn-sm" onClick={() => void remove(i)}>Remove</button>}
                    </div>
                  </div>
                ))}

                {p ? (
                  <div className="vp-pending">
                    <img src={p.url} alt={`New photo, not yet saved: ${v.label}`} />
                    <div>
                      {p.flags.length ? p.flags.map((f) => <p key={f} className="vp-warn">{FLAG_MESSAGES[f]}</p>) : <p className="hint">Looks clear. Check the area is visible, then save.</p>}
                      {pct !== undefined ? (
                        <div className="progress-bar" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label={`Uploading ${v.label}`}><span style={{ width: `${pct}%` }} /></div>
                      ) : (
                        <div className="cluster">
                          <button type="button" className="btn btn-primary btn-sm" onClick={() => void upload(v.value)}>{errors[v.value] ? "Try again" : p.flags.length ? "Use anyway" : "Save photo"}</button>
                          <button type="button" className="btn btn-secondary btn-sm" onClick={() => discard(v.value)}>Retake</button>
                        </div>
                      )}
                    </div>
                  </div>
                ) : (v.value !== "concern" || canAddConcern) && (
                  <div className="cluster">
                    <label className="btn btn-primary btn-sm vp-file">
                      {current ? "Retake photo" : "Take photo"}
                      <input type="file" accept="image/jpeg,image/png,image/webp" capture={helper ? "environment" : "user"} onChange={(e) => { void choose(v.value, e.target.files?.[0]); e.target.value = ""; }} />
                    </label>
                    <label className="btn btn-secondary btn-sm vp-file">
                      Choose from gallery
                      <input type="file" accept="image/jpeg,image/png,image/webp" onChange={(e) => { void choose(v.value, e.target.files?.[0]); e.target.value = ""; }} />
                    </label>
                  </div>
                )}
                {errors[v.value] && <p className="field-error" role="alert">{errors[v.value]}</p>}
              </div>
            </li>
          );
        })}
      </ol>

      {submitError && <div className="error-summary" role="alert"><p style={{ margin: 0 }}>{submitError}</p></div>}
      <div className="vp-actions">
        <button type="button" className="btn btn-primary" disabled={submitting || !data.images.length} onClick={() => void submit()}>
          {submitting ? "Submitting…" : "Submit for doctor review"}
        </button>
        <button type="button" className="btn btn-secondary" onClick={() => setHelpOpen((o) => !o)} aria-expanded={helpOpen}>Need help?</button>
      </div>
      {data.missingRecommended.length > 0 && data.images.length > 0 && !data.assistanceRequested && (
        <p className="hint">Not added yet: {data.missingRecommended.map((v) => MOUTH_VIEWS.find((x) => x.value === v)?.label ?? v).join(", ")}. You can still submit; the doctor will ask for more photos if needed. If you cannot take one, choose “Need help?”.</p>
      )}
      {helpOpen && (
        <div className="card stack" style={{ "--stack": "10px" } as React.CSSProperties}>
          {helpSent || data.assistanceRequested ? (
            <p role="status" style={{ margin: 0 }}>We have noted that you need help. You can also call {data.clinic.name} at {data.clinic.phone}. You may now submit the photos you have.</p>
          ) : (
            <>
              <label htmlFor="help-note">Tell us what is difficult (optional)</label>
              <textarea id="help-note" rows={3} maxLength={500} value={helpNote} onChange={(e) => setHelpNote(e.target.value)} placeholder="e.g. I cannot photograph under my tongue" />
              <div className="cluster"><button type="button" className="btn btn-primary btn-sm" onClick={() => void askHelp()}>Request help</button><span className="hint">Or call {data.clinic.name} at {data.clinic.phone}.</span></div>
            </>
          )}
        </div>
      )}
      <CaseTimeline events={data.timeline} title="Your progress" />
    </div>
  );
}
