import Link from "next/link";
import { RISK_FACTORS, WARNING_SIGNS } from "@/content/site";
import { pageMetadata, webPageJsonLd } from "@/lib/seo";
import { JsonLd } from "@/components/JsonLd";
import { PageHeader, RelatedLinks } from "@/components/SiteChrome";
import { TrackedLink } from "@/components/client/Track";

export const metadata = pageMetadata("know");

export default function KnowPage() {
  return (
    <>
      <JsonLd data={{ ...webPageJsonLd("know", "MedicalWebPage"), audience: { "@type": "PeopleAudience", audienceType: "General public" } }} />
      <PageHeader page="know" eyebrow="Risk factors · warning signs · when to seek care">
        <p className="lede">Most oral cancers start as a visible change in the mouth. Knowing what to look for — and acting within two weeks — makes early care possible.</p>
      </PageHeader>
      <section className="section">
        <div className="container">
          <h2 id="warning-signs">Warning signs</h2>
          <p>See a doctor or dentist if any of these <strong>lasts more than two weeks</strong>:</p>
          <ul className="signs">
            {WARNING_SIGNS.map((s) => <li key={s.title}><div><strong>{s.title}</strong><br /><span style={{ color: "var(--muted)" }}>{s.detail}</span></div></li>)}
          </ul>
        </div>
      </section>
      <section className="section section-alt">
        <div className="container split split-even">
          <div className="prose">
            <h2 id="risk-factors">What increases the risk</h2>
            <ul>{RISK_FACTORS.map((r) => <li key={r}>{r}</li>)}</ul>
            <p>The risk generally rises with how long and how often these are used. Stopping at any age lowers risk over time.</p>
            <p><Link href="/get-help#quit">Get help to quit tobacco or supari →</Link></p>
          </div>
          <div className="prose">
            <h2 id="self-check">A simple self-check</h2>
            <ol>
              <li>In good light, look at your lips, gums, the inside of your cheeks, the roof and floor of your mouth.</li>
              <li>Lift and look under your tongue, and at both sides.</li>
              <li>Feel your neck and under your jaw for lumps.</li>
              <li>Notice anything that has not healed in two weeks.</li>
            </ol>
            <div className="callout callout-warn">
              A self-check does not replace an examination. If you notice a change, or you use tobacco or areca nut, get screened.
            </div>
          </div>
        </div>
      </section>
      <section className="section">
        <div className="container">
          <h2>When to seek care</h2>
          <p className="lede">Do not wait for pain — many early changes are painless. Act early:</p>
          <div className="cluster" style={{ marginTop: 16 }}>
            <TrackedLink event="register_cta_clicked" href="/register" className="btn btn-primary">Register for screening</TrackedLink>
            <Link href="/camps" className="btn btn-secondary">Find a camp</Link>
            <Link href="/get-help#suspicious-lesion" className="btn btn-ghost">I have a mouth change</Link>
          </div>
        </div>
      </section>
      <RelatedLinks page="know" />
    </>
  );
}
