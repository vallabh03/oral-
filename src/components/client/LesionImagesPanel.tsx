"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { CLINICAL_PHOTO_STATUS_LABELS, CONSENT_POLICIES, LESION_SITES } from "@/lib/shared/constants";
import { CameraCapture } from "./CameraCapture";
import { getJson, postJson, sendJson, type ApiError } from "./api";
import { useConfirm } from "./ConfirmDialog";
import { useToast } from "./Toaster";

type Status = { photo: keyof typeof CLINICAL_PHOTO_STATUS_LABELS; face: "granted" | "declined" | "withdrawn" | "not_recorded" };
type Image = { id: string; lesionSite: string; lesionSiteLabel: string; includesFace: boolean; bytes: number; width: number; height: number; capturedAt: string; capturedBy: string; examVersion: number; examStatus: "draft" | "verified" };
type Data = {
  status: Status;
  images: Image[];
  hiddenAfterWithdrawal: number;
  canCapture: boolean;
  latestExam: { id: string; version: number; status: "draft" | "verified"; lesionPresent: string | null; lesionSites: string[] } | null;
};

const fmt = (d: string) => new Date(d).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" });
const badge: Record<Status["photo"], string> = { granted: "badge-ok", declined: "badge-warn", withdrawn: "badge-danger", not_recorded: "", not_applicable: "" };

/**
 * Oral lesion image capture (PRD v1.2). Clinical documentation for authorised review — not a
 * diagnosis. Consent is separate and explicit; declining never blocks the examination.
 */
export function LesionImagesPanel({ patientId, disabled }: { patientId: string; disabled: boolean }) {
  const toast = useToast();
  const { confirm, dialog } = useConfirm();
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState("");
  const [consentForm, setConsentForm] = useState<{ decision: "granted" | "declined" | ""; face: boolean } | null>(null);
  const [capture, setCapture] = useState<{ site: string; includesFace: boolean; replacesId?: string } | null>(null);
  const [viewer, setViewer] = useState<{ url: string; image: Image } | null>(null);
  const viewerRef = useRef<HTMLDialogElement>(null);

  const load = useCallback(async () => {
    try {
      setData(await getJson<Data>(`/api/patients/${patientId}/lesion-images`));
      setError("");
    } catch (e) {
      setError((e as ApiError).message);
    }
  }, [patientId]);
  useEffect(() => void load(), [load]);

  const saveConsent = async () => {
    if (!consentForm?.decision) return;
    const ok = await confirm({
      title: consentForm.decision === "granted" ? "Record consent to clinical photography?" : "Record that photography was declined?",
      body: consentForm.decision === "granted"
        ? "Confirm you have read the consent statement to the participant in their language and they agreed."
        : "The examination continues normally without images. You can record a new decision later if the participant changes their mind.",
      confirmLabel: "Record decision",
    });
    if (!ok) return;
    try {
      await postJson(`/api/patients/${patientId}/clinical-photo-consent`, { decision: consentForm.decision, faceDecision: consentForm.decision === "granted" ? (consentForm.face ? "granted" : "declined") : undefined });
      toast(consentForm.decision === "granted" ? "Photography consent recorded" : "Declined — continue the examination without images", "success");
      setConsentForm(null);
      void load();
    } catch (e) {
      toast((e as ApiError).message, "error");
    }
  };

  const open = async (image: Image, variant: "view" | "download") => {
    try {
      const r = await postJson<{ url: string }>(`/api/lesion-images/${image.id}/link`, { variant });
      if (variant === "download") {
        const a = document.createElement("a");
        a.href = r.url;
        a.rel = "noopener";
        a.click();
        toast("Download started (link valid for 5 minutes)", "success");
      } else {
        setViewer({ url: r.url, image });
        requestAnimationFrame(() => viewerRef.current?.showModal());
      }
    } catch (e) {
      toast((e as ApiError).message, "error");
    }
  };

  const remove = async (image: Image) => {
    const ok = await confirm({ title: "Delete this clinical image?", body: "The image is removed from the record. The deletion is logged with your name and reason.", confirmLabel: "Delete image", danger: true });
    if (!ok) return;
    const reason = window.prompt("Reason for deletion (required)", "Image not clinically useful")?.trim();
    if (!reason || reason.length < 3) return toast("A reason is required to delete an image.", "error");
    try {
      await sendJson("DELETE", `/api/lesion-images/${image.id}`, { reason });
      toast("Image deleted", "success");
      void load();
    } catch (e) {
      toast((e as ApiError).message, "error");
    }
  };

  if (error) return <section className="card" aria-labelledby="li-h"><h2 id="li-h" style={{ fontSize: "var(--step-1)" }}>Clinical images</h2><p className="field-error" role="alert">{error}</p></section>;
  if (!data) return <section className="card" aria-busy="true" aria-label="Loading clinical images"><div className="skeleton" style={{ height: 24, width: "40%" }} /><div className="skeleton" style={{ height: 80, marginTop: 12 }} /></section>;

  const exam = data.latestExam;
  const lesionRecorded = exam?.lesionPresent === "yes" || exam?.lesionPresent === "uncertain";
  const sites = exam?.lesionSites?.length ? LESION_SITES.filter((s) => exam.lesionSites.includes(s.value)) : LESION_SITES;

  return (
    <section className="card" aria-labelledby="li-h">
      {dialog}
      <div className="cluster" style={{ justifyContent: "space-between" }}>
        <h2 id="li-h" style={{ fontSize: "var(--step-1)", margin: 0 }}>2b. Clinical images of the lesion</h2>
        <span className={`badge ${badge[data.status.photo]}`} role="status">{CLINICAL_PHOTO_STATUS_LABELS[data.status.photo]}</span>
      </div>
      <p className="hint" style={{ marginTop: 6 }}>Optional clinical documentation for authorised review. Not a diagnosis, never analysed by AI, and not included in reports or WhatsApp messages.</p>

      {!exam && <p>Save the examination first. Images can be added when a lesion is recorded.</p>}
      {exam && !lesionRecorded && data.status.photo !== "granted" && <p>No lesion is recorded in the latest examination, so photography is not applicable.</p>}

      {exam && lesionRecorded && !disabled && exam.status === "draft" && !consentForm && (data.status.photo === "not_recorded" || data.status.photo === "declined" || data.status.photo === "withdrawn") && (
        <div className="callout" style={{ marginTop: 12 }}>
          {data.status.photo === "declined" ? <p style={{ marginTop: 0 }}>The participant declined photography. Complete the examination without images.</p> : <p style={{ marginTop: 0 }}>Ask the participant for separate consent before taking any photograph.</p>}
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => setConsentForm({ decision: "", face: false })}>{data.status.photo === "not_recorded" ? "Ask for photography consent" : "Record a new decision"}</button>
        </div>
      )}

      {consentForm && (
        <fieldset style={{ marginTop: 12 }}>
          <legend>Clinical photography consent</legend>
          <p style={{ marginTop: 0 }}>Read this to the participant in their language:</p>
          <blockquote className="callout" style={{ margin: "0 0 12px" }}>{CONSENT_POLICIES.clinical_photo.text}</blockquote>
          <div className="choice-grid">
            <label className="choice"><input type="radio" name="cp-decision" checked={consentForm.decision === "granted"} onChange={() => setConsentForm({ ...consentForm, decision: "granted" })} /> Participant agrees</label>
            <label className="choice"><input type="radio" name="cp-decision" checked={consentForm.decision === "declined"} onChange={() => setConsentForm({ ...consentForm, decision: "declined", face: false })} /> Participant declines</label>
          </div>
          {consentForm.decision === "granted" && (
            <label className="choice" style={{ marginTop: 8 }}>
              <input type="checkbox" checked={consentForm.face} onChange={(e) => setConsentForm({ ...consentForm, face: e.target.checked })} />
              <span>{CONSENT_POLICIES.clinical_photo_face.text} <span className="hint">(Only if clinically necessary.)</span></span>
            </label>
          )}
          <p className="hint">Consent version {CONSENT_POLICIES.clinical_photo.version} (draft pending approval).</p>
          <div className="cluster">
            <button type="button" className="btn btn-primary btn-sm" disabled={!consentForm.decision} onClick={saveConsent}>Save decision</button>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setConsentForm(null)}>Cancel</button>
          </div>
        </fieldset>
      )}

      {data.canCapture && !disabled && !capture && (
        <div className="cluster" style={{ marginTop: 12 }}>
          <button type="button" className="btn btn-primary btn-sm" onClick={() => setCapture({ site: sites[0]?.value ?? "other", includesFace: false })}>Add lesion image</button>
        </div>
      )}

      {capture && exam && (
        <div className="stack" style={{ marginTop: 12 }}>
          <div className="form-row">
            <div className="field">
              <label htmlFor="li-site">Lesion site shown</label>
              <select id="li-site" value={capture.site} onChange={(e) => setCapture({ ...capture, site: e.target.value })}>
                {sites.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
              </select>
            </div>
            <div className="field">
              <label className="choice" style={{ marginTop: 28 }}>
                <input type="checkbox" checked={capture.includesFace} disabled={data.status.face !== "granted"} onChange={(e) => setCapture({ ...capture, includesFace: e.target.checked })} />
                <span>Image includes facial features {data.status.face !== "granted" && <span className="hint">(not consented — keep the face out of frame)</span>}</span>
              </label>
            </div>
          </div>
          {capture.replacesId && <p className="callout callout-warn" style={{ margin: 0 }}>The new image will replace the selected one.</p>}
          <CameraCapture
            key={`${capture.site}-${capture.includesFace}-${capture.replacesId ?? ""}`}
            variant="clinical"
            subjectLabel="the affected area"
            uploadUrl={`/api/patients/${patientId}/lesion-images?${new URLSearchParams({ examId: exam.id, lesionSite: capture.site, includesFace: String(capture.includesFace), ...(capture.replacesId ? { replacesId: capture.replacesId } : {}) })}`}
            onUploaded={() => { toast("Clinical image saved", "success"); setCapture(null); void load(); }}
            onSkip={() => setCapture(null)}
          />
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => setCapture(null)}>Close camera</button>
        </div>
      )}

      {data.hiddenAfterWithdrawal > 0 && <p className="callout callout-warn" style={{ marginTop: 12 }}>{data.hiddenAfterWithdrawal} image(s) are hidden because photography consent was withdrawn. Retention follows the approved programme policy.</p>}

      {data.images.length > 0 && (
        <ul className="lesion-grid" aria-label="Saved clinical images">
          {data.images.map((img) => (
            <li key={img.id} className="lesion-card">
              <strong>{img.lesionSiteLabel}</strong>
              <span className="hint">{fmt(img.capturedAt)} · {img.capturedBy}</span>
              <span className="hint">{img.width}×{img.height}px · {(img.bytes / 1024 / 1024).toFixed(1)} MB · exam v{img.examVersion}{img.includesFace ? " · includes face" : ""}</span>
              <div className="cluster" style={{ gap: 6 }}>
                <button type="button" className="btn btn-secondary btn-sm" onClick={() => open(img, "view")}>View</button>
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => open(img, "download")}>Download</button>
                {img.examStatus === "draft" && !disabled && data.status.photo === "granted" && (
                  <>
                    <button type="button" className="btn btn-ghost btn-sm" onClick={() => setCapture({ site: img.lesionSite, includesFace: img.includesFace && data.status.face === "granted", replacesId: img.id })}>Replace</button>
                    <button type="button" className="btn btn-ghost btn-sm" onClick={() => remove(img)}>Delete</button>
                  </>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
      {data.images.length === 0 && data.status.photo === "granted" && !capture && <p className="hint" style={{ marginTop: 12 }}>No images saved yet.</p>}

      <dialog ref={viewerRef} className="lesion-dialog" aria-labelledby="lv-title" onClose={() => setViewer(null)}>
        {viewer && (
          <>
            <div className="dialog-body lesion-viewer">
              <h2 id="lv-title" style={{ fontSize: "var(--step-1)" }}>{viewer.image.lesionSiteLabel} · {fmt(viewer.image.capturedAt)}</h2>
              <img src={viewer.url} alt={`Clinical image of the ${viewer.image.lesionSiteLabel.toLowerCase()}`} referrerPolicy="no-referrer" />
              <p className="hint">Clinical documentation for authorised review — not a diagnosis. This view link expires in 5 minutes.</p>
            </div>
            <div className="dialog-actions">
              <button type="button" className="btn btn-primary" onClick={() => viewerRef.current?.close()} autoFocus>Close</button>
            </div>
          </>
        )}
      </dialog>
    </section>
  );
}
