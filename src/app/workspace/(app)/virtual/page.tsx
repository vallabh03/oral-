import { requireStaff } from "@/lib/server/pageAuth";
import { config } from "@/lib/server/config";
import { VirtualQueue } from "@/components/client/VirtualQueue";

export const metadata = { title: "Virtual review" };

export default async function VirtualReviewPage() {
  await requireStaff("virtual.review");
  return (
    <div className="stack" style={{ "--stack": "16px" } as React.CSSProperties}>
      <h1 style={{ fontSize: "var(--step-3)", margin: 0 }}>Virtual review</h1>
      <p className="hint" style={{ margin: 0 }}>Participants who registered remotely and sent photos of their mouth. Open a case to review the photos and answers and record the outcome.</p>
      {config().VIRTUAL_SCREENING_ENABLED ? <VirtualQueue /> : (
        <p className="callout">Photo-based virtual screening is switched off. It is turned on once the photography instructions, consent wording, messages and retention policy are approved.</p>
      )}
    </div>
  );
}
