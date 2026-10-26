import Link from "next/link";
import { pageMetadata, webPageJsonLd } from "@/lib/seo";
import { JsonLd } from "@/components/JsonLd";
import { PageHeader, RelatedLinks } from "@/components/SiteChrome";
import { TrackedLink, TrackView } from "@/components/client/Track";

export const metadata = pageMetadata("virtual");

export default function VirtualScreeningPage() {
  return (
    <>
      <TrackView event="camp_info_viewed" />
      <JsonLd data={webPageJsonLd("virtual")} />
      <PageHeader page="virtual" eyebrow="From home">
        <p className="lede">Cannot reach a screening camp? Start from home. Register online, answer a short questionnaire and speak with the programme team by phone or video.</p>
        <div className="cluster" style={{ marginTop: 20 }}>
          <TrackedLink event="register_cta_clicked" href="/register?mode=virtual" className="btn btn-primary">Register for virtual screening <span aria-hidden="true">→</span></TrackedLink>
          <Link href="/camps" className="btn btn-secondary">Find a camp instead</Link>
        </div>
      </PageHeader>
      <section className="section">
        <div className="container">
          <h2>How virtual screening works</h2>
          <ol className="pathway">
            <li><strong>Register online</strong><br />Name, age, phone and consent. About a minute.</li>
            <li><strong>Questionnaire</strong><br />Nine short questions about habits and mouth symptoms.</li>
            <li><strong>Call or video</strong><br />The programme team contacts you to talk through your answers.</li>
            <li><strong>Examination if needed</strong><br />If anything needs a closer look, we book you into a camp or clinic.</li>
          </ol>

          <div className="card" style={{ marginTop: 32, borderLeft: "4px solid var(--brand)" }}>
            <h2 style={{ fontSize: "var(--step-1)", marginTop: 0 }}>Important to know</h2>
            <ul>
              <li>Virtual screening does not replace a mouth examination by a clinician, and it cannot tell you whether you have cancer.</li>
              <li>If you have a mouth ulcer, white or red patch, or lump that has lasted more than two weeks, please see a doctor now. Do not wait for a call.</li>
              <li>Your information is protected in the same way as at a camp. Read the <Link href="/privacy">privacy notice</Link>.</li>
            </ul>
          </div>
        </div>
      </section>
      <RelatedLinks page="virtual" />
    </>
  );
}
