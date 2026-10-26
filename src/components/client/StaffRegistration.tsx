"use client";
import { useState } from "react";
import { RegistrationForm, type CampOption } from "./RegistrationForm";
import { CameraCapture } from "./CameraCapture";

export function StaffRegistration({ camps, virtualPhotos = false }: { camps: CampOption[]; virtualPhotos?: boolean }) {
  const [created, setCreated] = useState<{ id: string; displayId: string; photoConsent: boolean } | null>(null);
  const [photo, setPhoto] = useState<"pending" | "saved" | "skipped">("pending");
  const photoDone = photo !== "pending";
  if (!created) {
    return <RegistrationForm endpoint="/api/patients" camps={camps} staffMode virtualPhotos={virtualPhotos} onRegistered={(r) => setCreated({ id: r.id!, displayId: r.displayId, photoConsent: r.photoConsent })} />;
  }
  return (
    <div className="stack" style={{ "--stack": "20px" } as React.CSSProperties}>
      <div className="success-state" role="status">
        <h2>Registered as <span className="code-chip">{created.displayId}</span></h2>
        <p style={{ margin: 0 }}>{created.photoConsent ? "Next, take the participant's identity photo." : "Photo consent was not given — confirm identity verbally at each visit."}</p>
      </div>
      {created.photoConsent && !photoDone && (
        <CameraCapture uploadUrl={`/api/patients/${created.id}/photo`} subjectLabel="the participant" onUploaded={() => setPhoto("saved")} onSkip={() => setPhoto("skipped")} />
      )}
      {photo === "saved" && <p className="badge badge-ok" role="status">Photo saved</p>}
      {photo === "skipped" && <p className="badge badge-warn" role="status">Photo skipped — take it from the record later</p>}
      {(photoDone || !created.photoConsent) && (
        <div className="cluster">
          {/* Full navigation: the new record page must render fresh server data. */}
          <a href={`/workspace/patients/${created.id}`} className="btn btn-primary">Open record (questionnaire &amp; exam)</a>
          <button className="btn btn-ghost" onClick={() => { setCreated(null); setPhoto("pending"); }}>Register another</button>
        </div>
      )}
    </div>
  );
}
