import type { Metadata } from "next";
import { ResumeExchange } from "@/components/client/ParticipantJourney";

export const metadata: Metadata = { title: "Resume registration", robots: { index: false, follow: false }, referrer: "no-referrer" };

export default function ResumePage() {
  return (
    <section className="section">
      <div className="container" style={{ maxWidth: 680 }}>
        <h1>Resume registration</h1>
        <ResumeExchange />
      </div>
    </section>
  );
}
