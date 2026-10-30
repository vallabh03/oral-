"use client";
import { useRef, useState } from "react";
import { postJson, type ApiError } from "./api";

/** Participant ID + mobile → WhatsApp code → session. Returns to the photos or status page. */
export function ParticipantLogin() {
  const [step, setStep] = useState<"details" | "code">("details");
  const [displayId, setDisplayId] = useState("");
  const [mobile, setMobile] = useState("");
  const [code, setCode] = useState("");
  const [info, setInfo] = useState("");
  const [devCode, setDevCode] = useState("");
  const [error, setError] = useState("");
  const [fields, setFields] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const codeRef = useRef<HTMLInputElement>(null);

  const request = async (e?: React.FormEvent) => {
    e?.preventDefault();
    setBusy(true);
    setError("");
    setFields({});
    try {
      const r = await postJson<{ message: string; devCode?: string; unavailable?: boolean }>("/api/intake/login/request", { displayId: displayId.trim().toUpperCase(), mobile });
      if (r.unavailable) {
        setError(r.message); // no delivery channel yet (pilot without WhatsApp): stay on this step
        return;
      }
      setInfo(r.message);
      setDevCode(r.devCode ?? "");
      setStep("code");
      requestAnimationFrame(() => codeRef.current?.focus());
    } catch (err) {
      const a = err as ApiError;
      setFields(a.fields ?? {});
      setError(a.message);
    } finally {
      setBusy(false);
    }
  };

  const verify = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await postJson("/api/intake/login/verify", { displayId: displayId.trim().toUpperCase(), mobile, code });
      window.location.assign("/register/photos");
    } catch (err) {
      setError((err as ApiError).message);
      setBusy(false);
    }
  };

  if (step === "code") {
    return (
      <form onSubmit={verify} className="stack" style={{ "--stack": "14px" } as React.CSSProperties} noValidate>
        <p role="status" style={{ margin: 0 }}>{info}</p>
        {devCode && <p className="callout" style={{ margin: 0 }}>Test mode (no real messages are sent): your code is <span className="code-chip">{devCode}</span></p>}
        <div className="field">
          <label htmlFor="otp">6-digit code</label>
          <input ref={codeRef} id="otp" inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))} aria-invalid={!!error} aria-describedby={error ? "otp-err" : undefined} />
          {error && <p className="field-error" id="otp-err" role="alert">{error}</p>}
        </div>
        <div className="cluster">
          <button className="btn btn-primary" type="submit" disabled={busy || code.length !== 6}>{busy ? "Checking…" : "Log in"}</button>
          <button className="btn btn-ghost" type="button" disabled={busy} onClick={() => { setCode(""); void request(); }}>Send a new code</button>
        </div>
      </form>
    );
  }
  return (
    <form onSubmit={request} className="stack" style={{ "--stack": "14px" } as React.CSSProperties} noValidate>
      <div className="field">
        <label htmlFor="pid">Participant ID</label>
        <input id="pid" type="text" autoComplete="off" placeholder="e.g. HAOC-DS-0042" maxLength={24} value={displayId} onChange={(e) => setDisplayId(e.target.value)} aria-invalid={!!fields.displayId} aria-describedby={fields.displayId ? "pid-err" : undefined} />
        {fields.displayId && <p className="field-error" id="pid-err">{fields.displayId}</p>}
      </div>
      <div className="field">
        <label htmlFor="pmobile">Mobile number</label>
        <input id="pmobile" type="tel" inputMode="numeric" autoComplete="tel-national" maxLength={10} placeholder="10 digits" value={mobile} onChange={(e) => setMobile(e.target.value.replace(/\D/g, ""))} aria-invalid={!!fields.mobile} aria-describedby={fields.mobile ? "pmobile-err" : undefined} />
        {fields.mobile && <p className="field-error" id="pmobile-err">{fields.mobile}</p>}
      </div>
      {error && !Object.keys(fields).length && <p className="field-error" role="alert">{error}</p>}
      <button className="btn btn-primary" type="submit" disabled={busy}>{busy ? "Sending…" : "Send code on WhatsApp"}</button>
    </form>
  );
}
