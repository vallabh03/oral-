"use client";
import { useEffect, useRef, useState } from "react";
import { Icon } from "../Icon";
import { newKey, uploadImage, type ApiError } from "./api";

const MAX_DIM = 720;

/**
 * Downscales and compresses on the device before upload (WebP where supported, else JPEG).
 * A typical 12-MP phone photo becomes ~40–90 KB, which keeps uploads fast on camp mobile data
 * and is the first line of defence for server load.
 */
export async function compressImage(source: CanvasImageSource, w: number, h: number): Promise<Blob> {
  const scale = Math.min(1, MAX_DIM / Math.max(w, h));
  const cw = Math.round(w * scale);
  const ch = Math.round(h * scale);
  const canvas = document.createElement("canvas");
  canvas.width = cw;
  canvas.height = ch;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas unavailable");
  ctx.drawImage(source, 0, 0, cw, ch);
  const toBlob = (type: string, q: number) => new Promise<Blob | null>((r) => canvas.toBlob(r, type, q));
  const webp = await toBlob("image/webp", 0.82);
  if (webp && webp.type === "image/webp") return webp;
  const jpeg = await toBlob("image/jpeg", 0.85);
  if (!jpeg) throw new Error("Could not encode photo");
  return jpeg;
}

async function fileToBlob(file: File): Promise<Blob> {
  const bmp = await createImageBitmap(file, { imageOrientation: "from-image" } as ImageBitmapOptions).catch(() => null);
  if (bmp) return compressImage(bmp, bmp.width, bmp.height);
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    return compressImage(img, img.naturalWidth, img.naturalHeight);
  } finally {
    URL.revokeObjectURL(url);
  }
}

/**
 * Clinical capture keeps full resolution and never re-compresses an uploaded file: the server
 * removes metadata losslessly so the clinical image content is preserved.
 */
async function clinicalSnap(v: HTMLVideoElement): Promise<Blob> {
  const scale = Math.min(1, 3000 / Math.max(v.videoWidth, v.videoHeight));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(v.videoWidth * scale);
  canvas.height = Math.round(v.videoHeight * scale);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas unavailable");
  ctx.drawImage(v, 0, 0, canvas.width, canvas.height);
  const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/jpeg", 0.95));
  if (!blob) throw new Error("Could not encode photo");
  return blob;
}

const CLINICAL_MAX_BYTES = 15 * 1024 * 1024;

type Props = {
  uploadUrl: string;
  onUploaded: (photoId: string) => void;
  onSkip?: () => void;
  subjectLabel?: string;
  /** "clinical": rear camera, full resolution, no face guide, original files uploaded unchanged. */
  variant?: "identity" | "clinical";
};

export function CameraCapture({ uploadUrl, onUploaded, onSkip, subjectLabel = "your face", variant = "identity" }: Props) {
  const clinical = variant === "clinical";
  const video = useRef<HTMLVideoElement>(null);
  const stream = useRef<MediaStream | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const key = useRef(newKey());
  const [mode, setMode] = useState<"idle" | "live" | "preview" | "uploading" | "done">("idle");
  const [preview, setPreview] = useState<{ blob: Blob; url: string } | null>(null);
  const [error, setError] = useState("");
  const [progress, setProgress] = useState(0);
  const [ready, setReady] = useState(false);

  const stop = () => {
    stream.current?.getTracks().forEach((t) => t.stop());
    stream.current = null;
  };
  useEffect(() => () => { stop(); if (preview) URL.revokeObjectURL(preview.url); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const start = async () => {
    setError("");
    if (!navigator.mediaDevices?.getUserMedia) {
      fileInput.current?.click();
      return;
    }
    try {
      setReady(false);
      stream.current = await navigator.mediaDevices.getUserMedia({
        video: clinical ? { facingMode: { ideal: "environment" }, width: { ideal: 2560 }, height: { ideal: 1920 } } : { facingMode: "user", width: { ideal: 1280 }, height: { ideal: 960 } },
        audio: false,
      });
      setMode("live");
      requestAnimationFrame(() => {
        if (video.current) {
          video.current.srcObject = stream.current;
          void video.current.play();
        }
      });
      // Some devices don't reliably fire loadeddata; also poll for the first decoded frame.
      const started = Date.now();
      const poll = window.setInterval(() => {
        if ((video.current?.videoWidth ?? 0) > 0) setReady(true);
        if ((video.current?.videoWidth ?? 0) > 0 || Date.now() - started > 15_000 || !stream.current) window.clearInterval(poll);
      }, 200);
    } catch (e) {
      const denied = (e as DOMException)?.name === "NotAllowedError";
      setError(denied
        ? "Camera permission was denied. Allow camera access in the browser settings, or upload an existing image instead."
        : "No camera is available on this device. You can upload an existing image instead.");
    }
  };

  const snap = async () => {
    const v = video.current;
    if (!v || !v.videoWidth) return;
    const blob = clinical ? await clinicalSnap(v) : await compressImage(v, v.videoWidth, v.videoHeight);
    stop();
    setPreview({ blob, url: URL.createObjectURL(blob) });
    setMode("preview");
  };

  const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    if (!/^image\//.test(f.type)) return setError("Please choose an image file.");
    if (clinical) {
      if (!/^image\/(jpeg|png|webp)$/.test(f.type)) return setError("Use a JPEG, PNG or WebP image. On iPhone, set Camera › Formats to “Most Compatible”.");
      if (f.size > CLINICAL_MAX_BYTES) return setError("That image is larger than 15 MB. Choose a smaller file.");
      setPreview({ blob: f, url: URL.createObjectURL(f) }); // original file, unchanged
      setMode("preview");
      setError("");
      return;
    }
    if (f.size > 25 * 1024 * 1024) return setError("That file is too large. Please choose a smaller photo.");
    try {
      const blob = await fileToBlob(f);
      setPreview({ blob, url: URL.createObjectURL(blob) });
      setMode("preview");
      setError("");
    } catch {
      setError("That photo could not be read. Please try another one.");
    }
  };

  const retake = () => {
    if (preview) URL.revokeObjectURL(preview.url);
    setPreview(null);
    key.current = newKey();
    setMode("idle");
  };

  const upload = async () => {
    if (!preview) return;
    setMode("uploading");
    setProgress(0);
    setError("");
    try {
      const r = await uploadImage(uploadUrl, preview.blob, key.current, setProgress);
      setMode("done");
      onUploaded(r.id);
    } catch (e) {
      setError((e as ApiError).message || "Upload failed. Please try again.");
      setMode("preview");
    }
  };

  return (
    <div className="camera">
      <div className={`camera-frame${clinical ? " camera-clinical" : ""}`} aria-live="polite">
        {mode === "live" && (
          <>
            <video ref={video} playsInline muted aria-label={`Live camera preview of ${subjectLabel}`} onLoadedData={() => setReady(true)} />
            {!clinical && <div className="camera-guide" aria-hidden="true" />}
          </>
        )}
        {(mode === "preview" || mode === "uploading" || mode === "done") && preview && <img src={preview.url} alt={`Captured photo of ${subjectLabel}`} />}
        {mode === "idle" && (
          <div style={{ display: "grid", placeItems: "center", height: "100%", color: "#ddd", textAlign: "center", padding: 20 }}>
            <div><Icon name="camera" size={48} /><p style={{ marginTop: 8 }}>{clinical ? "Photograph only the affected area: close up, in focus and in good light. Avoid the participant’s full face." : "Face the camera in good light. Remove sunglasses or a helmet."}</p></div>
          </div>
        )}
      </div>
      {mode === "uploading" && (
        <div>
          <div className="progress-bar" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress} aria-label="Upload progress"><span style={{ "--w": `${progress}%` } as React.CSSProperties} /></div>
          <p className="hint">Uploading… {progress}%</p>
        </div>
      )}
      {error && <p className="field-error" role="alert">{error}</p>}
      <div className="cluster" style={{ justifyContent: "center" }}>
        {mode === "idle" && (
          <>
            <button type="button" className="btn btn-primary" onClick={start}><Icon name="camera" /> Open camera</button>
            <button type="button" className="btn btn-ghost" onClick={() => fileInput.current?.click()}>{clinical ? "Upload an existing image" : "Upload a photo"}</button>
            {onSkip && <button type="button" className="btn btn-ghost" onClick={onSkip}>Skip for now</button>}
          </>
        )}
        {mode === "live" && (
          <>
            <button type="button" className="btn btn-primary" onClick={snap} disabled={!ready} aria-busy={!ready}>{ready ? (clinical ? "Take close-up photo" : "Take photo") : "Starting camera…"}</button>
            <button type="button" className="btn btn-ghost" onClick={() => { stop(); setMode("idle"); }}>Cancel</button>
          </>
        )}
        {mode === "preview" && (
          <>
            <button type="button" className="btn btn-primary" onClick={upload}>{clinical ? "Save image" : "Use this photo"}</button>
            <button type="button" className="btn btn-ghost" onClick={retake}>Retake</button>
            {clinical && <button type="button" className="btn btn-ghost" onClick={() => { retake(); onSkip?.(); }}>Discard</button>}
          </>
        )}
        {mode === "done" && <p className="badge badge-ok" role="status"><Icon name="check" size={16} /> {clinical ? "Image saved" : "Photo saved"}</p>}
      </div>
      <input ref={fileInput} type="file" accept="image/jpeg,image/png,image/webp" capture={clinical ? "environment" : "user"} hidden onChange={onFile} />
    </div>
  );
}
