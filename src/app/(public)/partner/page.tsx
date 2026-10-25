import Link from "next/link";
import { pageMetadata, webPageJsonLd } from "@/lib/seo";
import { JsonLd } from "@/components/JsonLd";
import { PageHeader, RelatedLinks } from "@/components/SiteChrome";

export const metadata = pageMetadata("partner");

const WAYS = [
  { t: "Employers & industry", d: "Host WORKPLACE SAFE or BUILD SAFE screening and prevention sessions at your sites." },
  { t: "Colleges & ITIs", d: "Bring NEXTGEN SAFE awareness and tobacco-prevention sessions to students." },
  { t: "Driver & worker associations", d: "Host DRIVE SAFE camps at stands and association meetings." },
  { t: "CSR & philanthropy", d: "Support screening camps, cessation support and follow-up for people referred." },
  { t: "Hospitals & clinicians", d: "Join as a clinical partner for specialist evaluation and care." },
  { t: "Academic & knowledge partners", d: "Help evaluate outcomes and strengthen the evidence base." },
];

export default function PartnerPage() {
  return (
    <>
      <JsonLd data={webPageJsonLd("partner")} />
      <PageHeader page="partner" eyebrow="Work with us">
        <p className="lede">The initiative remains the primary identity; partners are recognised as Clinical, Outreach, CSR or Knowledge Partners.</p>
      </PageHeader>
      <section className="section">
        <div className="container">
          <ul className="grid" style={{ listStyle: "none", padding: 0 }}>
            {WAYS.map((w) => <li key={w.t} className="card"><h2 style={{ fontSize: "var(--step-1)" }}>{w.t}</h2><p style={{ margin: 0, color: "var(--muted)" }}>{w.d}</p></li>)}
          </ul>
          <div className="cluster" style={{ marginTop: 28 }}><Link href="/contact" className="btn btn-primary">Start a conversation</Link></div>
        </div>
      </section>
      <RelatedLinks page="partner" />
    </>
  );
}
