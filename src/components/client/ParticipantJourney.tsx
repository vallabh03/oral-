"use client";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { STATUS_LABELS, type PatientStatus } from "@/lib/shared/constants";
import { CameraCapture } from "./CameraCapture";
import { Questionnaire } from "./Questionnaire";
import { RegistrationForm, type CampOption } from "./RegistrationForm";
import { CopyButton } from "./CopyButton";
import { getJson, postJson, type ApiError } from "./api";
import { track } from "./analytics";
import { useConfirm } from "./ConfirmDialog";
import { useToast } from "./Toaster";
import type { Answers } from "@/lib/shared/protocol";

type Status = {
  displayId: string; firstName: string; status: PatientStatus; statusLabel: string; questionnaire: string;
  photoCaptured: boolean; photoId: string | null; photoConsent: boolean; whatsappConsent: boolean; followupConsent: boolean;
};

export function RegistrationJourney({ camps }: { camps: CampOption[] }) {
  const [phase, setPhase] = useState<"form" | "photo" | "questionnaire" | "done">("form");
  const [displayId, setDisplayId] = useState("");
  const [resumeLink, setResumeLink] = useState("");

  useEffect(() => {
    if (phase !== "form") document.getElementById("journey-top")?.focus();
  }, [phase]);

  return (
    <div id="journey-top" tabIndex={-1} style={{ outline: "none" }}>
      {phase === "form" && (
        <RegistrationForm
          endpoint="/api/intake/register"
          camps={camps}
          onRegistered={(r) => {
            setDisplayId(r.displayId);
            // The token lives in the URL fragment, which browsers never send to servers or logs.
            setResumeLink(`${window.location.origin}/register/resume#token=${r.resumeToken}`);
            setPhase(r.photoConsent ? "photo" : "questionnaire");
          }}
        />
      )}
      {phase !== "form" && (
        <div className="callout" style={{ marginBottom: 20 }}>
          <p style={{ margin: 0 }}>Your participant ID is <span className="code-chip">{displayId}</span></p>
          <div className="copy-row" style={{ marginTop: 8 }}>
            <CopyButton value={displayId} what="Participant ID" />
            <CopyButton value={resumeLink} label="Copy resume link" what="Resume link" />
          </div>
          <p className="hint" style={{ marginTop: 8 }}>Keep the resume link private — it lets you continue on this or another device for 7 days.</p>
        </div>
      )}
      {phase === "photo" && (
        <section aria-labelledby="photo-h">
          <h2 id="photo-h" style={{ fontSize: "var(--step-2)" }}>Identity photo</h2>
          <p>So staff can find the right record at the camp, take a clear photo of your face. It is stored privately.</p>
          <CameraCapture uploadUrl="/api/intake/photo" onUploaded={() => setPhase("questionnaire")} onSkip={() => setPhase("questionnaire")} />
        </section>
      )}
      {phase === "questionnaire" && (
        <section aria-labelledby="q-h">
          <h2 id="q-h" style={{ fontSize: "var(--step-2)" }}>Brief questionnaire</h2>
          <p>About two minutes. Your answers are private and help the clinician.</p>
          <Questionnaire endpoint="/api/intake/questionnaire" onCompleted={() => { track("registration_completed"); setPhase("done"); }} />
        </section>
      )}
      {phase === "done" && <CompletionPanel displayId={displayId} />}
    </div>
  );
}

function CompletionPanel({ displayId }: { displayId: string }) {
  return (
    <div className="success-state" role="status">
      <h2>Questionnaire completed — clinician screening pending</h2>
      <p>Thank you. Your ID is <span className="code-chip">{displayId}</span>. Show your check-in QR code to camp staff.</p>
      <h3 style={{ fontSize: "var(--step-1)", marginTop: 16 }}>Next steps</h3>
      <ol>
        <li>Attend your screening camp (see <Link href="/camps">camps</Link>).</li>
        <li>A clinician will examine your mouth and explain the result.</li>
        <li>If anything worries you before then, see a doctor — do not wait.</li>
      </ol>
      <Link href="/register/status" className="btn btn-primary">View my status &amp; check-in QR</Link>
    </div>
  );
}

export function ParticipantStatusView() {
  const [s, setS] = useState<Status | null>(null);
  const [state, setState] = useState<"loading" | "ok" | "expired" | "error">("loading");
  const [qr, setQr] = useState("");
  const [answers, setAnswers] = useState<Answers | undefined>();
  const { confirm, dialog } = useConfirm();
  const toast = useToast();

  const load = useCallback(async () => {
    try {
      const data = await getJson<Status>("/api/intake/me");
      setS(data);
      setState("ok");
      if (data.questionnaire !== "completed") {
        const q = await getJson<{ answers: Answers }>("/api/intake/questionnaire");
        setAnswers(q.answers);
      }
    } catch (e) {
      setState((e as ApiError).status === 401 ? "expired" : "error");
    }
  }, []);
  useEffect(() => void load(), [load]);

  const showQr = async () => {
    try {
      const r = await postJson<{ svg: string }>("/api/intake/qr", {});
      setQr(r.svg);
    } catch (e) {
      toast((e as ApiError).message, "error");
    }
  };

  const withdraw = async (type: "photo" | "whatsapp_report" | "followup_contact" | "registration", label: string) => {
    const ok = await confirm({
      title: type === "registration" ? "Withdraw from the programme?" : `Withdraw ${label} consent?`,
      body: type === "registration" ? "Your registration will be closed and your link will stop working. Staff can help if you change your mind." : type === "photo" ? "Your photo will be deleted. Staff will confirm your identity another way." : "You will no longer receive these messages.",
      confirmLabel: "Withdraw",
      danger: true,
    });
    if (!ok) return;
    try {
      await postJson("/api/intake/consent/withdraw", { consentType: type });
      toast("Your choice has been recorded.", "success");
      if (type === "registration") setState("expired");
      else void load();
    } catch (e) {
      toast((e as ApiError).message, "error");
    }
  };

  if (state === "loading") {
    return <div aria-busy="true" aria-label="Loading your status" className="stack"><div className="skeleton" style={{ height: 32, width: "60%" }} /><div className="skeleton" style={{ height: 120 }} /><div className="skeleton" style={{ height: 48, width: "40%" }} /></div>;
  }
  if (state === "expired") {
    return (
      <div className="empty-state" role="status">
        <h2>Your session has ended</h2>
        <p>Open your resume link again to continue, or ask camp staff for help.</p>
        <Link href="/register" className="btn btn-primary">Start a new registration</Link>
      </div>
    );
  }
  if (state === "error" || !s) {
    return <div className="error-summary" role="alert"><h2>We could not load your status</h2><button className="btn btn-primary btn-sm" onClick={() => { setState("loading"); void load(); }}>Try again</button></div>;
  }
  return (
    <div className="stack" style={{ "--stack": "24px" } as React.CSSProperties}>
      {dialog}
      <div className="card">
        <p className="eyebrow">Hello, {s.firstName}</p>
        <h2 style={{ fontSize: "var(--step-2)" }}>{STATUS_LABELS[s.status] ?? s.statusLabel}</h2>
        <p className="copy-row">Participant ID <span className="code-chip">{s.displayId}</span> <CopyButton value={s.displayId} what="Participant ID" /></p>
        {s.photoId && <img src={`/api/photos/${s.photoId}?v=thumb`} alt="Your identity photo" width={96} height={96} className="avatar" loading="lazy" decoding="async" />}
      </div>
      {s.questionnaire !== "completed" && answers !== undefined && (
        <section className="card" aria-labelledby="resume-q">
          <h2 id="resume-q" style={{ fontSize: "var(--step-2)" }}>Finish your questionnaire</h2>
          <Questionnaire endpoint="/api/intake/questionnaire" initial={answers} onCompleted={() => { track("registration_completed"); void load(); }} />
        </section>
      )}
      {s.photoConsent && !s.photoCaptured && (
        <section className="card" aria-labelledby="photo-h2">
          <h2 id="photo-h2" style={{ fontSize: "var(--step-1)" }}>Add your identity photo</h2>
          <CameraCapture uploadUrl="/api/intake/photo" onUploaded={() => void load()} />
        </section>
      )}
      <section className="card" aria-labelledby="qr-h">
        <h2 id="qr-h" style={{ fontSize: "var(--step-1)" }}>Check-in QR code</h2>
        <p>Show this to camp staff. It only works with a signed-in staff device.</p>
        {qr ? <div className="qr-box" role="img" aria-label="Check-in QR code" dangerouslySetInnerHTML={{ __html: qr }} /> : <button className="btn btn-secondary btn-sm" onClick={showQr}>Show QR code</button>}
      </section>
      <section className="card" aria-labelledby="consent-h">
        <h2 id="consent-h" style={{ fontSize: "var(--step-1)" }}>Your consent choices</h2>
        <ul className="stack" style={{ listStyle: "none", padding: 0, "--stack": "8px" } as React.CSSProperties}>
          {s.photoConsent && <li className="cluster">Identity photo <button className="btn btn-ghost btn-sm" onClick={() => withdraw("photo", "photo")}>Withdraw</button></li>}
          {s.followupConsent && <li className="cluster">Follow-up contact <button className="btn btn-ghost btn-sm" onClick={() => withdraw("followup_contact", "follow-up contact")}>Withdraw</button></li>}
          {s.whatsappConsent && <li className="cluster">WhatsApp report <button className="btn btn-ghost btn-sm" onClick={() => withdraw("whatsapp_report", "WhatsApp")}>Withdraw</button></li>}
          <li className="cluster">Programme participation <button className="btn btn-ghost btn-sm" onClick={() => withdraw("registration", "registration")}>Withdraw from programme</button></li>
        </ul>
      </section>
    </div>
  );
}

export function ResumeExchange() {
  const [msg, setMsg] = useState("Opening your registration…");
  useEffect(() => {
    const token = new URLSearchParams(window.location.hash.slice(1)).get("token");
    history.replaceState(null, "", window.location.pathname); // drop the token from the address bar/history
    if (!token) {
      setMsg("This link is incomplete. Please use the full resume link.");
      return;
    }
    postJson("/api/intake/session", { token })
      .then(() => window.location.replace("/register/status"))
      .catch((e: ApiError) => setMsg(e.message));
  }, []);
  return <p role="status" className="lede">{msg}</p>;
}
