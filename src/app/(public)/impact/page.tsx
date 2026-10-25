import { pageMetadata, webPageJsonLd } from "@/lib/seo";
import { JsonLd } from "@/components/JsonLd";
import { EmptyState, PageHeader, RelatedLinks } from "@/components/SiteChrome";

export const metadata = pageMetadata("impact");

const MEASURES = ["People reached with awareness", "People screened", "People referred for specialist evaluation", "Referrals completed", "People offered cessation support", "Follow-up re-screenings"];

export default function ImpactPage() {
  return (
    <>
      <JsonLd data={webPageJsonLd("impact")} />
      <PageHeader page="impact" eyebrow="Transparent, verified reporting">
        <p className="lede">We will publish programme figures only after they are verified — no estimates or projections are shown as results.</p>
      </PageHeader>
      <section className="section">
        <div className="container">
          <EmptyState title="Verified figures will appear here after the pilot" icon="chart">
            <p style={{ color: "var(--muted)", maxWidth: "52ch", marginInline: "auto" }}>The DRIVE SAFE pilot is in preparation. Aggregated, de-identified results will be published here once reviewed.</p>
          </EmptyState>
          <h2 style={{ marginTop: 40 }}>What we will report</h2>
          <ul className="grid" style={{ "--min": "220px", listStyle: "none", padding: 0 } as React.CSSProperties}>
            {MEASURES.map((m) => <li key={m} className="card"><strong>{m}</strong></li>)}
          </ul>
        </div>
      </section>
      <RelatedLinks page="impact" />
    </>
  );
}
