import Link from "next/link";
import { pageMetadata, webPageJsonLd } from "@/lib/seo";
import { JsonLd } from "@/components/JsonLd";
import { PageHeader, RelatedLinks } from "@/components/SiteChrome";

export const metadata = pageMetadata("professionals");

export default function ProfessionalsPage() {
  return (
    <>
      <JsonLd data={{ ...webPageJsonLd("professionals", "MedicalWebPage"), audience: { "@type": "MedicalAudience", audienceType: "Clinician" } }} />
      <PageHeader page="professionals" eyebrow="Referral pathway">
        <p className="lede">For doctors, dentists and health workers who see a suspicious oral lesion and need a reliable route to specialist evaluation.</p>
      </PageHeader>
      <section className="section">
        <div className="container split">
          <div className="prose">
            <h2>When to refer</h2>
            <ul>
              <li>Non-healing ulcer, or a red, white or red-white lesion persisting beyond two weeks after removing any obvious cause.</li>
              <li>Induration, a proliferative growth, or unexplained restriction of mouth opening.</li>
              <li>A neck node or swelling with an oral finding.</li>
              <li>Any lesion where you are uncertain — the pathway prefers specialist evaluation to false reassurance.</li>
            </ul>
            <h2>How the pathway works</h2>
            <ol>
              <li>Send a referral request through the contact form (choose “Healthcare professional referral”). Do not include patient names or images.</li>
              <li>The programme team contacts you to arrange the referral securely.</li>
              <li>Suspicious lesions are prioritised for specialist assessment and diagnostic work-up.</li>
            </ol>
            <div className="callout callout-warn">Referral criteria and urgency rules are pending final approval by the programme&apos;s clinical owner.</div>
          </div>
          <aside className="card">
            <h2 style={{ fontSize: "var(--step-2)" }}>Make a referral request</h2>
            <p>Please share only your contact details and the urgency. Patient-identifying information is exchanged later through an approved secure channel.</p>
            <Link href="/contact" className="btn btn-primary">Contact the programme</Link>
          </aside>
        </div>
      </section>
      <RelatedLinks page="professionals" />
    </>
  );
}
