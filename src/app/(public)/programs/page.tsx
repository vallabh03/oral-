import Image from "next/image";
import Link from "next/link";
import { PROGRAMS } from "@/content/site";
import { pageMetadata, webPageJsonLd } from "@/lib/seo";
import { JsonLd } from "@/components/JsonLd";
import { PageHeader, RelatedLinks } from "@/components/SiteChrome";

export const metadata = pageMetadata("programs");

export default function ProgramsPage() {
  return (
    <>
      <JsonLd data={webPageJsonLd("programs", "CollectionPage")} />
      <PageHeader page="programs" eyebrow="Four outreach arms, one initiative">
        <p className="lede">Each programme inherits the same prevention-to-follow-up pathway and adapts outreach to where people work and learn.</p>
      </PageHeader>
      <section className="section">
        <div className="container">
          <ul className="grid" style={{ "--min": "280px", listStyle: "none", padding: 0 } as React.CSSProperties}>
            {PROGRAMS.map((p) => (
              <li key={p.key}>
                <Link href={`/programs/${p.key}`} className="card card-link">
                  <div className="card-media"><Image src={p.image} alt="" width={800} height={450} sizes="(min-width: 1100px) 360px, (min-width: 600px) 45vw, 100vw" /></div>
                  <span className={`badge ${p.status === "Pilot" ? "badge-brand" : ""}`}>{p.status}</span>
                  <h2 style={{ fontSize: "var(--step-2)", marginTop: 8 }}>{p.name}</h2>
                  <p style={{ fontWeight: 600 }}>{p.audience}</p>
                  <p style={{ color: "var(--muted)", margin: 0 }}>{p.summary}</p>
                </Link>
              </li>
            ))}
          </ul>
          <p className="callout" style={{ marginTop: 32 }}>These are outreach settings, not labels: oral cancer can affect anyone, and no group is singled out as responsible.</p>
        </div>
      </section>
      <RelatedLinks page="programs" />
    </>
  );
}
