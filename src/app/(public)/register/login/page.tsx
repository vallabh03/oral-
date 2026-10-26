import type { Metadata } from "next";
import { ParticipantLogin } from "@/components/client/ParticipantLogin";

export const metadata: Metadata = { title: "Log in to your registration", robots: { index: false, follow: false } };

export default function LoginPage() {
  return (
    <section className="section">
      <div className="container" style={{ maxWidth: 560 }}>
        <span className="eyebrow">Returning participants</span>
        <h1>Log in to your registration</h1>
        <p className="lede">Use your participant ID and the mobile number you registered with. We will send a 6-digit code to that number on WhatsApp.</p>
        <div className="card" style={{ marginTop: 20 }}><ParticipantLogin /></div>
      </div>
    </section>
  );
}
