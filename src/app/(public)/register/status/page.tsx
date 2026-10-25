import type { Metadata } from "next";
import { ParticipantStatusView } from "@/components/client/ParticipantJourney";

export const metadata: Metadata = { title: "Your screening status", robots: { index: false, follow: false } };

export default function StatusPage() {
  return (
    <section className="section">
      <div className="container" style={{ maxWidth: 820 }}>
        <h1>Your screening status</h1>
        <ParticipantStatusView />
      </div>
    </section>
  );
}
