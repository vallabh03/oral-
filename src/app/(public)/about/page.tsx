import Link from "next/link";
import { SITE } from "@/content/site";
import { pageMetadata, webPageJsonLd } from "@/lib/seo";
import { JsonLd } from "@/components/JsonLd";
import { PageHeader, RelatedLinks } from "@/components/SiteChrome";

export const metadata = pageMetadata("about");

export default function AboutPage() {
  return (
    <>
      <JsonLd data={webPageJsonLd("about", "AboutPage")} />
      <PageHeader page="about" eyebrow="Mission, founder and model">
        <p className="lede">{SITE.name} is the digital home of an oral cancer prevention and early-detection initiative.</p>
      </PageHeader>
      <section className="section">
        <div className="container split">
          <div className="prose">
            <h2>Our mission</h2>
            <p>
              To reduce the burden of oral cancer through prevention, tobacco-risk reduction and cessation support, early recognition of
              suspicious oral lesions, timely specialist evaluation, and appropriate linkage to diagnosis and care.
            </p>
            <h2>Why this initiative exists</h2>
            <p>
              Oral cancer can affect people during the most productive years of life, particularly where tobacco and areca-nut use begins early
              and preventive healthcare is hard to reach. Many mouth changes that need attention are visible and can be examined quickly — when
              people know what to look for and can reach a clinician.
            </p>
            <p>
              The initiative represents the whole state. Focused <Link href="/programs">outreach programmes</Link> take prevention and early
              detection to settings where access or risk warrants it, without labelling or stigmatising any occupation, age group or community.
            </p>
            <h2>The programme model</h2>
            <p>Awareness → prevention → risk assessment → early detection → specialist evaluation → appropriate care → follow-up.</p>
            <p>
              Screening uses a short questionnaire and a clinician-led oral examination. The clinician verifies findings before any screening
              category is assigned. Screening is never presented as a diagnosis.
            </p>
          </div>
          <aside className="card">
            <span className="eyebrow">Founder &amp; clinical lead</span>
            <h2 style={{ fontSize: "var(--step-2)" }}><a href={SITE.founder.url} target="_blank" rel="noopener">{SITE.founder.name}</a></h2>
            <p style={{ color: "var(--muted)" }}>{SITE.founder.role}</p>
            <p>Founded and clinically led by a head and neck cancer surgeon, the initiative is designed to build independent public credibility as a public-health programme rather than a hospital campaign.</p>
            <h3 style={{ fontSize: "var(--step-1)", marginTop: 20 }}>Partners</h3>
            <p style={{ color: "var(--muted)" }}>Clinical, outreach, CSR and knowledge partners will be listed here once agreements are confirmed.</p>
            <Link href="/partner" className="btn btn-secondary btn-sm">Partner with us</Link>
          </aside>
        </div>
      </section>
      <RelatedLinks page="about" />
    </>
  );
}
