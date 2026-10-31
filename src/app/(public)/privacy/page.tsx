import Link from "next/link";
import { pageMetadata, webPageJsonLd } from "@/lib/seo";
import { JsonLd } from "@/components/JsonLd";
import { PageHeader, RelatedLinks } from "@/components/SiteChrome";
import { config } from "@/lib/server/config";

export const metadata = pageMetadata("privacy");

export default function PrivacyPage() {
  return (
    <>
      <JsonLd data={webPageJsonLd("privacy")} />
      <PageHeader page="privacy" eyebrow="Draft — pending privacy and legal review">
        <p className="lede">This notice describes what the platform actually does. It will be finalised by the programme&apos;s privacy owner before live intake.</p>
      </PageHeader>
      <section className="section">
        <div className="container prose">
          <h2>What we collect and why</h2>
          <ul>
            <li><strong>Registration:</strong> name, age, optional mobile number, profession, usual working area, camp and how you heard about us — to run screening and follow-up.</li>
            <li><strong>Questionnaire:</strong> tobacco/areca use and current mouth symptoms — to support the clinician&apos;s assessment.</li>
            <li><strong>Examination:</strong> findings recorded and verified by an authorised clinician.</li>
            <li><strong>Identity photo (optional, with separate consent):</strong> a photo of your face so staff can match you to the right record at screening and follow-up. Never used for anything else, never published, never analysed by AI.</li>
            <li><strong>Consents:</strong> each consent you give or withdraw, with the wording version, language and time.</li>
          </ul>
          {config().CLINICAL_IMAGES_ENABLED ? (
            <p><strong>Clinical photographs (optional, with separate consent):</strong> if a clinician sees a change in your mouth, they may ask to photograph only the affected area for your clinical record. You can say no and your screening continues normally. These photos are seen only by authorised clinicians, are never published, never analysed by AI, and are not included in your report or WhatsApp messages.</p>
          ) : null}
          <p>We do <strong>not</strong> collect Aadhaar, your home address{config().CLINICAL_IMAGES_ENABLED ? "" : ", photos of your mouth"} or other identifiers.</p>
          <h2>Who can see it</h2>
          <p>Only pre-approved programme staff with two-step sign-in. Clinicians see records they need for care; analysts see de-identified counts only. Every access to a record or photo is logged in a tamper-evident audit trail.</p>
          <h2>Where it is stored</h2>
          <p>In encrypted databases and private storage hosted in India (AWS Asia Pacific — Hyderabad region, subject to final approval). Photos are kept in private, encrypted storage and served only to signed-in staff.</p>
          <h2>Messages</h2>
          <p>We contact you, or send your report by WhatsApp, only if you separately agreed. You can withdraw at any time and messages stop immediately.</p>
          <h2>Your choices</h2>
          <ul>
            <li>Withdraw optional consents (contact, WhatsApp, photo) — the photo is deleted when photo consent is withdrawn.</li>
            <li>Ask to see or correct your details, or withdraw from the programme.</li>
          </ul>
          <p>Ask camp staff, or use the <Link href="/contact">contact form</Link> and choose “Privacy or data request”.</p>
          <h2>How long we keep it</h2>
          <p>Retention periods for records, photos, consents and audit logs are being set by the programme and will be stated here before launch.</p>
          <h2>Website analytics</h2>
          <p>Optional, first-party and consent-based. See the <Link href="/cookies">cookie policy</Link>. No personal or health information is ever included.</p>
        </div>
      </section>
      <RelatedLinks page="privacy" />
    </>
  );
}
