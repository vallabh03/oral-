import Link from "next/link";
import { pageMetadata, webPageJsonLd } from "@/lib/seo";
import { JsonLd } from "@/components/JsonLd";
import { PageHeader, RelatedLinks } from "@/components/SiteChrome";
import { TrackedLink } from "@/components/client/Track";

export const metadata = pageMetadata("get-help");

export default function GetHelpPage() {
  return (
    <>
      <JsonLd data={webPageJsonLd("get-help", "MedicalWebPage")} />
      <PageHeader page="get-help" eyebrow="Screening · mouth changes · quitting tobacco">
        <p className="lede">Choose the help you need. If you are unwell or in severe pain, go to the nearest hospital.</p>
      </PageHeader>
      <section className="section">
        <div className="container grid" style={{ "--min": "300px" } as React.CSSProperties}>
          <article className="card" id="screening">
            <h2 style={{ fontSize: "var(--step-2)" }}>Get screened</h2>
            <p>Register online, answer a short questionnaire, then attend a camp where a clinician examines your mouth. It is free.</p>
            <TrackedLink event="register_cta_clicked" href="/register" className="btn btn-primary btn-sm">Register</TrackedLink>{" "}
            <Link href="/camps" className="btn btn-ghost btn-sm">Find a camp</Link>
          </article>
          <article className="card" id="suspicious-lesion">
            <h2 style={{ fontSize: "var(--step-2)" }}>I have a mouth change</h2>
            <p>A sore, white or red patch, lump or stiffness that has lasted <strong>more than two weeks</strong> should be examined soon — even if it does not hurt.</p>
            <p>See a doctor or dentist, attend a screening camp, or ask us how to reach a specialist.</p>
            <Link href="/contact" className="btn btn-secondary btn-sm">Ask the programme team</Link>
          </article>
          <article className="card" id="quit">
            <h2 style={{ fontSize: "var(--step-2)" }}>Help to quit tobacco or supari</h2>
            <p>Stopping tobacco, gutkha, khaini, pan with tobacco or areca nut lowers your risk at any age. You do not have to do it alone.</p>
            <ul>
              <li>Tell the camp team you would like help to quit.</li>
              <li>Or send us a message and choose “Help to quit tobacco”.</li>
            </ul>
            <Link href="/contact" className="btn btn-secondary btn-sm">Request quit support</Link>
          </article>
        </div>
      </section>
      <RelatedLinks page="get-help" />
    </>
  );
}
