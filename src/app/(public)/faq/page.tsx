import { FAQS } from "@/content/site";
import { faqJsonLd, pageMetadata } from "@/lib/seo";
import { JsonLd } from "@/components/JsonLd";
import { PageHeader, RelatedLinks } from "@/components/SiteChrome";

export const metadata = pageMetadata("faq");

export default function FaqPage() {
  return (
    <>
      {/* FAQPage markup mirrors the visible questions exactly (FR-SEO-06). */}
      <JsonLd data={faqJsonLd(FAQS)} />
      <PageHeader page="faq" eyebrow="Screening, privacy and results">
        <p className="lede">Select a question to expand the answer.</p>
      </PageHeader>
      <section className="section">
        <div className="container">
          <div className="faq prose" style={{ maxWidth: 860 }}>
            {FAQS.map((f, i) => (
              <details key={f.q} id={`q${i + 1}`}>
                <summary>{f.q}</summary>
                <div className="answer"><p style={{ margin: 0 }}>{f.a}</p></div>
              </details>
            ))}
          </div>
        </div>
      </section>
      <RelatedLinks page="faq" />
    </>
  );
}
