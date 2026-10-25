import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PROGRAMS, type PageKey } from "@/content/site";
import { pageMetadata, webPageJsonLd } from "@/lib/seo";
import { JsonLd } from "@/components/JsonLd";
import { PageHeader, RelatedLinks } from "@/components/SiteChrome";
import { TrackedLink } from "@/components/client/Track";

// Rendered per request so the CSP nonce applies; unknown slugs 404 below.
export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return PROGRAMS.some((p) => p.key === slug) ? pageMetadata(slug as PageKey) : {};
}

const DETAILS: Record<string, { what: string[]; how: string[] }> = {
  "drive-safe": {
    what: [
      "Registration at a driver stand, association meeting or on your own phone — about 30 to 45 seconds.",
      "A brief private questionnaire about tobacco/areca use and mouth symptoms — about two minutes.",
      "An oral examination by an authorised clinician, who verifies the findings.",
      "A screening category with clear next steps: education, cessation support, re-screening or referral.",
      "Follow-up for those who need it, without creating duplicate records.",
    ],
    how: ["Scan the programme QR code or open the registration page.", "Register and answer the questionnaire.", "Visit the camp; staff confirm your identity and the clinician examines you."],
  },
};

export default async function ProgramPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const p = PROGRAMS.find((x) => x.key === slug);
  if (!p) notFound();
  const d = DETAILS[p.key];
  return (
    <>
      <JsonLd data={webPageJsonLd(p.key)} />
      <PageHeader page={p.key} eyebrow={`${p.status} programme`}>
        <p className="lede">{p.summary}</p>
      </PageHeader>
      <section className="section">
        <div className="container split">
          <div className="prose">
            <h2>Who it is for</h2>
            <p>{p.audience}.</p>
            {d ? (
              <>
                <h2>What happens</h2>
                <ol>{d.what.map((w) => <li key={w}>{w}</li>)}</ol>
                <h2>How to take part</h2>
                <ol>{d.how.map((w) => <li key={w}>{w}</li>)}</ol>
                <div className="cluster" style={{ marginTop: 20 }}>
                  <TrackedLink event="register_cta_clicked" href="/register" className="btn btn-primary">Register for DRIVE SAFE</TrackedLink>
                  <Link href="/camps" className="btn btn-secondary">See camps</Link>
                </div>
              </>
            ) : (
              <>
                <h2>Status</h2>
                <p>This programme is being planned. Organisations interested in hosting or supporting it can get in touch now.</p>
                <Link href="/partner" className="btn btn-primary">Partner with us</Link>
              </>
            )}
          </div>
          <div className="hero-media" style={{ aspectRatio: "16 / 10" }}>
            <Image src={p.image} alt="" width={1200} height={675} sizes="(min-width: 900px) 40vw, 100vw" />
          </div>
        </div>
      </section>
      <RelatedLinks page={p.key} />
    </>
  );
}
