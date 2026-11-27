import type { Metadata } from "next";
import Link from "next/link";
import { config } from "@/lib/server/config";
import { EmptyState } from "@/components/SiteChrome";

// Landing page for the printed QR code at screening camps: the participant picks how they are
// being screened today, then goes straight to the matching registration form.
// Telugu and Hindi lines need native-speaker review.
export const metadata: Metadata = { title: "Start your screening", robots: { index: false, follow: true } };

export default function StartPage() {
  const c = config();
  const choices = [
    {
      href: "/register",
      title: "Screening at the camp today",
      te: "ఈరోజు క్యాంప్‌లో పరీక్ష",
      hi: "आज कैंप में जाँच",
      text: "A doctor examines your mouth here, in person.",
    },
    ...(c.VIRTUAL_SCREENING_ENABLED
      ? [{
          href: "/register?mode=virtual",
          title: "Virtual screening with photos",
          te: "ఫోటోలతో వర్చువల్ పరీక్ష",
          hi: "फोटो से वर्चुअल जाँच",
          text: "Take 5 photos of your mouth with your own phone. A doctor reviews them and we message you on WhatsApp.",
        }]
      : []),
  ];
  return (
    <section className="section">
      <div className="container stack" style={{ maxWidth: 640, "--stack": "16px" } as React.CSSProperties}>
        <span className="eyebrow">DRIVE SAFE oral health screening</span>
        <h1 style={{ marginBottom: 0 }}>How are you being screened today?</h1>
        <p className="lede" style={{ margin: 0 }}>Choose one. Registration takes about a minute.</p>
        {c.INTAKE_ENABLED ? (
          choices.map((o) => (
            <Link key={o.href} href={o.href} className="card" style={{ display: "block", textDecoration: "none", color: "inherit", borderLeft: "4px solid var(--brand)" }}>
              <strong style={{ fontSize: "var(--step-1)", display: "block" }}>{o.title} <span aria-hidden="true">→</span></strong>
              <span lang="te" style={{ display: "block" }}>{o.te}</span>
              <span lang="hi" style={{ display: "block" }}>{o.hi}</span>
              <span className="hint" style={{ display: "block", marginTop: 8 }}>{o.text}</span>
            </Link>
          ))
        ) : (
          <EmptyState title="Registration opens soon" icon="inbox">
            <p>Please ask the camp staff for help.</p>
          </EmptyState>
        )}
        <p className="hint" style={{ margin: 0 }}>Already registered? <Link href="/register/status">Check your status</Link>.</p>
      </div>
    </section>
  );
}
