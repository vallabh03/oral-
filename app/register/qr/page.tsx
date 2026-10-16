"use client";

import { useEffect, useState } from "react";
import { Activity, ArrowLeft, Printer } from "lucide-react";
import { QRImage } from "../../care-ui";
import { T } from "../../language";

export default function RegistrationQrPage() {
  const [registrationUrl, setRegistrationUrl] = useState("");
  useEffect(() => setRegistrationUrl(`${window.location.origin}/register`), []);

  return (
    <main className="intake-page">
      <a className="brand" href="/campaign">
        <span className="brand-mark"><Activity /></span>
        <span><T text="TELANGANA" /><span><T text="AGAINST ORAL CANCER" /></span></span>
      </a>
      <p className="eyebrow"><T text="DRIVE SAFE · PARTICIPANT ENTRY" /></p>
      <h1><T text="Scan to begin your screening." /></h1>
      <section className="panel stack qr-print-card">
        {registrationUrl && (
          <QRImage
            value={registrationUrl}
            alt="QR code that opens participant registration and questionnaire"
          />
        )}
        <p><T text="Scan this QR code with your phone camera to register and answer the oral-health questionnaire." /></p>
        <p className="fine patient-id">{registrationUrl}</p>
        <button className="secondary" onClick={() => window.print()}>
          <Printer size={16} /><T text=" Print QR code" />
        </button>
      </section>
      <a className="text-button" href="/campaign"><ArrowLeft size={15} /><T text=" Back to the programme" /></a>
    </main>
  );
}
