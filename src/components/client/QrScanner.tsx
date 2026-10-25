"use client";
import { useEffect, useRef, useState } from "react";

type Detector = { detect: (src: CanvasImageSource) => Promise<{ rawValue: string }[]> };

/** Scans a participant check-in QR with the native BarcodeDetector; falls back to manual entry. */
export function QrScanner({ onResult }: { onResult: (value: string) => void }) {
  const video = useRef<HTMLVideoElement>(null);
  const [msg, setMsg] = useState("Starting camera…");
  const [manual, setManual] = useState("");

  useEffect(() => {
    let stream: MediaStream | null = null;
    let timer = 0;
    let stopped = false;
    const BD = (window as unknown as { BarcodeDetector?: new (o: { formats: string[] }) => Detector }).BarcodeDetector;
    if (!BD || !navigator.mediaDevices?.getUserMedia) {
      setMsg("QR scanning is not supported on this browser. Type the code below.");
      return;
    }
    const detector = new BD({ formats: ["qr_code"] });
    navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } }).then((s) => {
      if (stopped) return s.getTracks().forEach((t) => t.stop());
      stream = s;
      if (video.current) {
        video.current.srcObject = s;
        void video.current.play();
      }
      setMsg("Point the camera at the participant's QR code.");
      const tick = async () => {
        if (stopped || !video.current) return;
        try {
          const codes = await detector.detect(video.current);
          const v = codes[0]?.rawValue;
          if (v && /^[A-Za-z0-9_-]{43}$/.test(v)) return onResult(v);
        } catch {}
        timer = window.setTimeout(tick, 250);
      };
      void tick();
    }).catch(() => setMsg("Camera unavailable. Type the code below."));
    return () => {
      stopped = true;
      window.clearTimeout(timer);
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, [onResult]);

  return (
    <div className="card" style={{ marginBottom: 16 }}>
      <p role="status">{msg}</p>
      <div className="camera-frame" style={{ maxWidth: 320, aspectRatio: "1" }}><video ref={video} playsInline muted aria-label="QR scanner camera" style={{ transform: "none" }} /></div>
      <form className="search-form" style={{ marginTop: 12 }} onSubmit={(e) => { e.preventDefault(); if (manual.trim()) onResult(manual.trim()); }}>
        <label htmlFor="qr-manual" className="visually-hidden">QR code value</label>
        <input id="qr-manual" type="text" value={manual} onChange={(e) => setManual(e.target.value)} maxLength={64} placeholder="Or paste the code" autoComplete="off" />
        <button className="btn btn-primary btn-sm" type="submit">Use code</button>
      </form>
    </div>
  );
}
