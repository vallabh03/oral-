"use client";
import { useState, useEffect, useRef } from "react";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
  DialogHeader,
} from "@/components/ui/dialog";
import { Camera, ScanLine, ShieldCheck } from "lucide-react";
import QRCode from "qrcode";
import jsQR from "jsqr";
export function Choice({
  value,
  onChange,
  options,
  label,
  labels,
}: {
  value: string;
  onChange: (v: string) => void;
  options: string[];
  label: string;
  labels?: Record<string, string>;
}) {
  return (
    <Select value={value || undefined} onValueChange={onChange}>
      <SelectTrigger aria-label={label} className="choice">
        <SelectValue placeholder={label} />
      </SelectTrigger>
      <SelectContent>
        {options.map((o) => (
          <SelectItem key={o} value={o}>
            {labels?.[o] || o}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
export function Check({
  checked,
  onChange,
  children,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  children: React.ReactNode;
}) {
  return (
    <label className="check-label">
      <Checkbox
        checked={checked}
        onCheckedChange={(v) => onChange(v === true)}
      />
      <span>{children}</span>
    </label>
  );
}
export function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
    </label>
  );
}
export function Modal({
  open,
  close,
  title,
  description,
  children,
}: {
  open: boolean;
  close: () => void;
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <Dialog open={open} onOpenChange={(v) => !v && close()}>
      <DialogContent className="care-dialog">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        {children}
      </DialogContent>
    </Dialog>
  );
}
export async function api(action?: string, data?: any, mode = "demo") {
  const r = await fetch("/api/care", {
    method: action ? "POST" : "GET",
    headers: { "Content-Type": "application/json", "x-care-mode": mode },
    ...(action ? { body: JSON.stringify({ action, ...data }) } : {}),
  });
  const j: any = await r.json();
  if (!r.ok) throw new Error(j.error || "Unable to complete request.");
  return j;
}
export function QRImage({ value }: { value: string }) {
  const [src, setSrc] = useState("");
  useEffect(() => {
    let active = true;
    QRCode.toDataURL(value, {
      width: 220,
      margin: 2,
      errorCorrectionLevel: "M",
      color: { dark: "#34383c", light: "#ffffff" },
    }).then((s) => active && setSrc(s));
    return () => {
      active = false;
    };
  }, [value]);
  return src ? (
    <img
      src={src}
      width="220"
      height="220"
      alt="QR code containing only the secure retrieval token"
    />
  ) : (
    <p>Preparing QR…</p>
  );
}
export function Scanner({ found }: { found: (v: string) => Promise<void> }) {
  const video = useRef<HTMLVideoElement>(null),
    stream = useRef<MediaStream | null>(null),
    timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [active, setActive] = useState(false),
    [error, setError] = useState(""),
    [manual, setManual] = useState("");
  function stop() {
    stream.current?.getTracks().forEach((t) => t.stop());
    stream.current = null;
    if (timer.current) clearTimeout(timer.current);
    setActive(false);
  }
  useEffect(
    () => () => {
      stream.current?.getTracks().forEach((t) => t.stop());
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );
  async function submit(v: string) {
    try {
      await found(v);
    } catch (e) {
      setError((e as Error).message);
    }
  }
  async function start() {
    setError("");
    try {
      if (!navigator.mediaDevices?.getUserMedia)
        throw new Error("Camera unavailable. Enter the participant ID below.");
      stream.current = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: "environment" } },
        audio: false,
      });
      setActive(true);
      if (video.current) {
        video.current.srcObject = stream.current;
        await video.current.play();
      }
      const canvas = document.createElement("canvas"),
        ctx = canvas.getContext("2d", { willReadFrequently: true });
      const scan = () => {
        const v = video.current;
        if (v && ctx && v.videoWidth) {
          canvas.width = v.videoWidth;
          canvas.height = v.videoHeight;
          ctx.drawImage(v, 0, 0);
          const frame = ctx.getImageData(0, 0, canvas.width, canvas.height);
          const code = jsQR(frame.data, frame.width, frame.height);
          if (code) {
            stop();
            void submit(code.data);
            return;
          }
        }
        timer.current = setTimeout(scan, 200);
      };
      scan();
    } catch {
      stop();
      setError(
        "Camera permission was denied or the camera is unavailable. Enter the participant ID instead.",
      );
    }
  }
  return (
    <div className="stack">
      <div className="scanner">
        <video
          ref={video}
          muted
          playsInline
          style={{ display: active ? "block" : "none" }}
        />
        {!active && <ScanLine size={60} />}
        <span>
          {active
            ? "Position the patient QR inside the frame"
            : "Camera opens only when you choose to scan"}
        </span>
      </div>
      <button className="secondary" onClick={active ? stop : start}>
        <Camera size={17} />
        {active ? "Stop camera" : "Allow camera & scan"}
      </button>
      <Field label="Or enter participant ID">
        <input
          value={manual}
          onChange={(e) => setManual(e.target.value)}
          placeholder="HAOC-DS-…"
        />
      </Field>
      <button
        className="primary"
        disabled={!manual.trim()}
        onClick={() => submit(manual.trim())}
      >
        Find authorized record
      </button>
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      <p className="fine">
        <ShieldCheck size={15} /> A QR code identifies a record. Staff
        authorization is still required.
      </p>
    </div>
  );
}
