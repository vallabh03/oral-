import { pageMetadata, webPageJsonLd } from "@/lib/seo";
import { JsonLd } from "@/components/JsonLd";
import { PageHeader, RelatedLinks } from "@/components/SiteChrome";
import { ContactForm } from "@/components/client/ContactForm";

export const metadata = pageMetadata("contact");

export default function ContactPage() {
  return (
    <>
      <JsonLd data={webPageJsonLd("contact", "ContactPage")} />
      <PageHeader page="contact" eyebrow="We usually reply within two working days">
        <p className="lede">For a medical emergency, go to the nearest hospital. Please do not send health details or photos through this form.</p>
      </PageHeader>
      <section className="section">
        <div className="container split">
          <ContactForm />
          <aside className="card">
            <h2 style={{ fontSize: "var(--step-1)" }}>Other ways to reach us</h2>
            <p>At a camp, speak to any team member wearing a programme badge.</p>
            <p style={{ color: "var(--muted)" }}>A programme helpline and email address will be listed here once confirmed.</p>
          </aside>
        </div>
      </section>
      <RelatedLinks page="contact" />
    </>
  );
}
