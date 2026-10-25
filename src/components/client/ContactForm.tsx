"use client";
import { useRef, useState } from "react";
import { CONTACT_TOPICS } from "@/lib/shared/constants";
import { track } from "./analytics";
import { newKey, postJson, type ApiError } from "./api";

type Fields = { name: string; email: string; topic: string; message: string };

export function ContactForm() {
  const [values, setValues] = useState<Fields>({ name: "", email: "", topic: "general", message: "" });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [state, setState] = useState<"idle" | "sending" | "sent" | "failed">("idle");
  const [failure, setFailure] = useState("");
  const key = useRef(newKey());
  const summary = useRef<HTMLDivElement>(null);

  const set = (k: keyof Fields) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => setValues((v) => ({ ...v, [k]: e.target.value }));

  const validate = (): Record<string, string> => {
    const e: Record<string, string> = {};
    if (!values.name.trim()) e.name = "Enter your name";
    if (!/^\S+@\S+\.\S+$/.test(values.email)) e.email = "Enter a valid email address";
    if (values.message.trim().length < 10) e.message = "Please write at least 10 characters";
    return e;
  };

  const submit = async (ev: React.FormEvent<HTMLFormElement>) => {
    ev.preventDefault();
    const honeypot = (ev.currentTarget.elements.namedItem("website") as HTMLInputElement).value;
    const e = validate();
    setErrors(e);
    if (Object.keys(e).length) {
      requestAnimationFrame(() => summary.current?.focus());
      return;
    }
    setState("sending");
    try {
      await postJson("/api/contact", { ...values, idempotencyKey: key.current, website: honeypot || undefined });
      setState("sent");
      track("contact_submitted");
    } catch (err) {
      const apiErr = err as ApiError;
      if (apiErr.fields) {
        setErrors(apiErr.fields);
        setState("idle");
        requestAnimationFrame(() => summary.current?.focus());
      } else {
        setFailure(apiErr.message);
        setState("failed");
      }
    }
  };

  if (state === "sent") {
    return (
      <div className="success-state" role="status" tabIndex={-1} ref={(el) => el?.focus()}>
        <h2>Thank you — your message has been sent</h2>
        <p>The programme team will reply to {values.email}. You do not need to send it again.</p>
        <button type="button" className="btn btn-secondary btn-sm" onClick={() => { key.current = newKey(); setValues({ name: "", email: "", topic: "general", message: "" }); setState("idle"); }}>Send another message</button>
      </div>
    );
  }

  const errList = Object.entries(errors);
  return (
    <form onSubmit={submit} noValidate aria-describedby={errList.length ? "contact-errors" : undefined}>
      {errList.length > 0 && (
        <div className="error-summary" id="contact-errors" ref={summary} tabIndex={-1} role="alert">
          <h2>Please fix {errList.length === 1 ? "this problem" : `these ${errList.length} problems`}</h2>
          <ul>{errList.map(([k, m]) => <li key={k}><a href={`#c-${k}`}>{m}</a></li>)}</ul>
        </div>
      )}
      {state === "failed" && (
        <div className="error-summary" role="alert">
          <h2>Your message was not sent</h2>
          <p style={{ margin: 0 }}>{failure} Your text is still here — please try again.</p>
        </div>
      )}
      <div className="form-row">
        <div className="field">
          <label htmlFor="c-name">Your name <span className="req" aria-hidden="true">*</span></label>
          <input id="c-name" name="name" type="text" autoComplete="name" maxLength={120} required value={values.name} onChange={set("name")} aria-invalid={!!errors.name} aria-describedby={errors.name ? "c-name-err" : undefined} />
          {errors.name && <p className="field-error" id="c-name-err">{errors.name}</p>}
        </div>
        <div className="field">
          <label htmlFor="c-email">Email <span className="req" aria-hidden="true">*</span></label>
          <input id="c-email" name="email" type="email" autoComplete="email" inputMode="email" maxLength={254} required value={values.email} onChange={set("email")} aria-invalid={!!errors.email} aria-describedby={errors.email ? "c-email-err" : undefined} />
          {errors.email && <p className="field-error" id="c-email-err">{errors.email}</p>}
        </div>
      </div>
      <div className="field">
        <label htmlFor="c-topic">Topic</label>
        <select id="c-topic" name="topic" value={values.topic} onChange={set("topic")}>
          {CONTACT_TOPICS.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
        </select>
      </div>
      <div className="field">
        <label htmlFor="c-message">Message <span className="req" aria-hidden="true">*</span><span className="hint">Please do not include health details, ID numbers or photos.</span></label>
        <textarea id="c-message" name="message" maxLength={3000} required value={values.message} onChange={set("message")} aria-invalid={!!errors.message} aria-describedby={errors.message ? "c-message-err" : undefined} />
        {errors.message && <p className="field-error" id="c-message-err">{errors.message}</p>}
      </div>
      <div className="honeypot" aria-hidden="true">
        <label htmlFor="c-website">Website</label>
        <input id="c-website" name="website" type="text" tabIndex={-1} autoComplete="off" />
      </div>
      <button className="btn btn-primary" type="submit" disabled={state === "sending"}>
        {state === "sending" ? <><span className="spinner" aria-hidden="true" /> Sending…</> : "Send message"}
      </button>
      <p className="hint" style={{ marginTop: 12 }}>We use your details only to reply. See the <a href="/privacy">privacy notice</a>.</p>
    </form>
  );
}
