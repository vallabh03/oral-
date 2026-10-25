"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { PasswordInput } from "./PasswordInput";
import { postJson, type ApiError } from "./api";

export function ResetFlow() {
  const [token, setToken] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [state, setState] = useState<"idle" | "busy" | "sent" | "done">("idle");
  const [error, setError] = useState("");

  useEffect(() => {
    const t = new URLSearchParams(window.location.hash.slice(1)).get("token");
    if (t) {
      setToken(t);
      history.replaceState(null, "", window.location.pathname);
    }
  }, []);

  const request = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setState("busy");
    try {
      await postJson("/api/auth/reset", { action: "request", email });
      setState("sent");
    } catch (err) {
      setError((err as ApiError).message);
      setState("idle");
    }
  };

  const complete = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (pw !== pw2) return setError("The two passwords do not match.");
    setState("busy");
    try {
      await postJson("/api/auth/reset", { action: "complete", token, password: pw });
      setState("done");
    } catch (err) {
      const a = err as ApiError;
      setError(a.fields?.password ?? a.message);
      setState("idle");
    }
  };

  if (state === "sent") return <div className="success-state" role="status"><p style={{ margin: 0 }}>If an account exists for that email, a reset link has been sent. It expires in 30 minutes.</p></div>;
  if (state === "done") return <div className="success-state" role="status"><p>Your password has been set. All other sessions were signed out.</p><Link href="/workspace/login" className="btn btn-primary">Sign in</Link></div>;

  const err = error && <div className="error-summary" role="alert" style={{ padding: 12 }}><p style={{ margin: 0 }}>{error}</p></div>;
  if (token) {
    return (
      <form onSubmit={complete} noValidate>
        {err}
        <div className="field">
          <label htmlFor="pw">New password <span className="hint">At least 12 characters. A short phrase works well.</span></label>
          <PasswordInput id="pw" autoComplete="new-password" minLength={12} maxLength={128} value={pw} onChange={(e) => setPw(e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="pw2">Confirm new password</label>
          <PasswordInput id="pw2" autoComplete="new-password" maxLength={128} value={pw2} onChange={(e) => setPw2(e.target.value)} />
        </div>
        <button className="btn btn-primary btn-block" disabled={state === "busy"}>Set password</button>
      </form>
    );
  }
  return (
    <form onSubmit={request} noValidate>
      {err}
      <p>Enter your work email and we will send a single-use reset link.</p>
      <div className="field">
        <label htmlFor="r-email">Work email</label>
        <input id="r-email" type="email" autoComplete="username" maxLength={254} value={email} onChange={(e) => setEmail(e.target.value)} />
      </div>
      <button className="btn btn-primary btn-block" disabled={state === "busy"}>Send reset link</button>
    </form>
  );
}
