import type { Metadata } from "next";
import Link from "next/link";
import { ParticipantLogin } from "@/components/client/ParticipantLogin";
import { config, loginCodesAvailable } from "@/lib/server/config";

export const metadata: Metadata = { title: "Log in to your registration", robots: { index: false, follow: false } };

export default function LoginPage() {
  const c = config();
  return (
    <section className="section">
      <div className="container" style={{ maxWidth: 560 }}>
        <span className="eyebrow">Returning participants</span>
        <h1>Log in to your registration</h1>
        {loginCodesAvailable() ? (
          <>
            <p className="lede">Use your participant ID and the mobile number you registered with. We will send a 6-digit code to that number on WhatsApp.</p>
            <div className="card" style={{ marginTop: 20 }}><ParticipantLogin /></div>
          </>
        ) : (
          <p className="callout">
            Logging in with a code is not available yet. Please open the resume link you received when you registered, or{" "}
            <Link href="/contact">contact {c.NOTIFY_CLINIC_NAME}</Link>
            {c.NOTIFY_CLINIC_PHONE && c.NOTIFY_CLINIC_PHONE !== "the programme helpline" ? ` at ${c.NOTIFY_CLINIC_PHONE}` : ""} for help with your registration.
          </p>
        )}
      </div>
    </section>
  );
}
