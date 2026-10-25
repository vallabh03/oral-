"use client";
import Link from "next/link";
import { useRef, useState } from "react";
import { PasswordInput } from "./PasswordInput";
import { postJson, type ApiError } from "./api";

type Step = "password" | "mfa" | "mfa-enroll";

export function LoginFlow({ passwordEnabled, oidcEnabled }: { passwordEnabled: boolean; oidcEnabled: boolean }) {
  const [step, setStep] = useState<Step>("password");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [enroll, setEnroll] = useState<{ secret: string; qrSvg: string } | null>(null);
  const codeRef = useRef<HTMLInputElement>(null);

  const fail = (e: unknown) => setError((e as ApiError).message);

  const submitPassword = async (ev: React.FormEvent) => {
    ev.preventDefault();
    setError("");
    if (!email || !password) return setError("Enter your email and password.");
    setBusy(true);
    try {
      const r = await postJson<{ next: Step; csrfToken: string }>("/api/auth/login", { email, password });
      sessionStorage.setItem("pending-csrf", r.csrfToken);
      setPassword("");
      if (r.next === "mfa-enroll") {
        const e = await postJson<{ secret: string; qrSvg: string }>("/api/auth/mfa/enroll", { action: "start" });
        setEnroll(e);
      }
      setStep(r.next);
      requestAnimationFrame(() => codeRef.current?.focus());
    } catch (e) {
      fail(e);
    } finally {
      setBusy(false);
    }
  };

  const submitCode = async (ev: React.FormEvent) => {
    ev.preventDefault();
    setError("");
    if (!/^\d{6}$/.test(code)) return setError("Enter the 6-digit code from your authenticator app.");
    setBusy(true);
    try {
      const r = step === "mfa"
        ? await postJson<{ redirect: string }>("/api/auth/mfa", { code })
        : await postJson<{ redirect: string }>("/api/auth/mfa/enroll", { action: "confirm", code });
      sessionStorage.removeItem("pending-csrf");
      window.location.assign(r.redirect);
    } catch (e) {
      fail(e);
      setCode("");
      if ((e as ApiError).status === 401 && (e as ApiError).code === "unauthenticated") setStep("password");
    } finally {
      setBusy(false);
    }
  };

  const errorBox = error && <div className="error-summary" role="alert" style={{ padding: 12 }}><p style={{ margin: 0 }}>{error}</p></div>;

  if (step !== "password") {
    return (
      <form onSubmit={submitCode} noValidate>
        {errorBox}
        <h2 style={{ fontSize: "var(--step-1)", fontFamily: "var(--font-sans)" }}>{step === "mfa" ? "Two-step verification" : "Set up two-step verification"}</h2>
        {step === "mfa-enroll" && enroll && (
          <div className="stack" style={{ marginBottom: 16 }}>
            <p>Two-step verification is required for every staff account. Scan this code with an authenticator app (for example Google Authenticator or Microsoft Authenticator), then enter the 6-digit code.</p>
            <div className="qr-box" role="img" aria-label="Authenticator setup QR code" dangerouslySetInnerHTML={{ __html: enroll.qrSvg }} />
            <p className="hint">Can&apos;t scan? Enter this key manually: <span className="code-chip" style={{ wordBreak: "break-all" }}>{enroll.secret}</span></p>
          </div>
        )}
        <div className="field">
          <label htmlFor="otp">6-digit code</label>
          <input ref={codeRef} id="otp" type="text" inputMode="numeric" autoComplete="one-time-code" pattern="\d{6}" maxLength={6} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))} />
        </div>
        <button type="submit" className="btn btn-primary btn-block" disabled={busy}>{busy ? "Verifying…" : "Verify and continue"}</button>
      </form>
    );
  }

  return (
    <div className="stack">
      {oidcEnabled && (
        <>
          <a href="/api/auth/oidc/start" className="btn btn-secondary btn-block">Sign in with Google (organisation account)</a>
          {passwordEnabled && <p className="hint" style={{ textAlign: "center" }}>or</p>}
        </>
      )}
      {passwordEnabled && (
        <form onSubmit={submitPassword} noValidate>
          {errorBox}
          <div className="field">
            <label htmlFor="email">Work email</label>
            <input id="email" type="email" autoComplete="username" inputMode="email" maxLength={254} value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <div className="field">
            <label htmlFor="password">Password</label>
            <PasswordInput id="password" autoComplete="current-password" maxLength={128} value={password} onChange={(e) => setPassword(e.target.value)} />
          </div>
          <button type="submit" className="btn btn-primary btn-block" disabled={busy}>{busy ? <><span className="spinner" aria-hidden="true" /> Signing in…</> : "Sign in"}</button>
          <p style={{ marginTop: 12, textAlign: "center" }}><Link href="/workspace/reset">Forgot password?</Link></p>
        </form>
      )}
    </div>
  );
}
