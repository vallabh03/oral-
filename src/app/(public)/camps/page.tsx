import Link from "next/link";
import { pageMetadata, webPageJsonLd } from "@/lib/seo";
import { JsonLd } from "@/components/JsonLd";
import { EmptyState, PageHeader, RelatedLinks } from "@/components/SiteChrome";
import { TrackedLink, TrackView } from "@/components/client/Track";
import { listCamps } from "@/lib/server/services/admin";
import { absoluteUrl } from "@/content/site";

export const metadata = pageMetadata("camps");

export default async function CampsPage() {
  let camps: Awaited<ReturnType<typeof listCamps>> = [];
  let failed = false;
  try {
    camps = await listCamps({ publicOnly: true });
  } catch {
    failed = true;
  }
  const fmt = (d: string | null) => (d ? new Date(d).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Kolkata" }) : "Date to be announced");
  const events = camps.filter((c) => c.starts_at).map((c) => ({
    "@context": "https://schema.org",
    "@type": "Event",
    name: c.name,
    description: "Free DRIVE SAFE oral health screening: short registration, questionnaire and a clinician examination.",
    image: absoluteUrl("/images/programme-drive.jpg"),
    startDate: c.starts_at,
    endDate: c.ends_at ?? undefined,
    eventStatus: c.status === "cancelled" ? "https://schema.org/EventCancelled" : "https://schema.org/EventScheduled",
    eventAttendanceMode: "https://schema.org/OfflineEventAttendanceMode",
    location: { "@type": "Place", name: c.working_area, address: { "@type": "PostalAddress", addressLocality: c.working_area, addressRegion: "Telangana", addressCountry: "IN" } },
    organizer: { "@id": absoluteUrl("/#organization") },
    isAccessibleForFree: true,
    offers: { "@type": "Offer", price: 0, priceCurrency: "INR", availability: c.status === "cancelled" ? "https://schema.org/SoldOut" : "https://schema.org/InStock", url: absoluteUrl("/register") },
  }));
  return (
    <>
      <TrackView event="camp_info_viewed" />
      <JsonLd data={[webPageJsonLd("camps", "CollectionPage"), ...events]} />
      <PageHeader page="camps" eyebrow="DRIVE SAFE">
        <p className="lede">Registration takes a minute; the examination takes a few minutes. Bring a mobile phone if you want follow-up messages.</p>
      </PageHeader>
      <section className="section">
        <div className="container">
          {failed ? (
            <EmptyState title="Camp information is temporarily unavailable" icon="alert"><p>Please try again shortly, or <Link href="/contact">contact the programme</Link>.</p></EmptyState>
          ) : camps.length === 0 ? (
            <EmptyState title="No upcoming camps are published yet" icon="map">
              <p style={{ color: "var(--muted)" }}>You can still register now — the team will tell you when and where to come.</p>
              <TrackedLink event="register_cta_clicked" href="/register" className="btn btn-primary">Register now</TrackedLink>
            </EmptyState>
          ) : (
            <ul className="grid" style={{ "--min": "280px", listStyle: "none", padding: 0 } as React.CSSProperties}>
              {camps.map((c) => (
                <li key={c.id} className="card">
                  <span className={`badge ${c.status === "active" ? "badge-ok" : c.status === "cancelled" ? "badge-danger" : "badge-brand"}`}>{c.status === "active" ? "Open now" : c.status === "cancelled" ? "Cancelled" : "Upcoming"}</span>
                  <h2 style={{ fontSize: "var(--step-1)", marginTop: 8 }}>{c.name}</h2>
                  <p style={{ margin: 0 }}><strong>Area:</strong> {c.working_area}</p>
                  <p style={{ margin: 0 }}><strong>When:</strong> {fmt(c.starts_at)}</p>
                  <TrackedLink event="register_cta_clicked" href="/register" className="btn btn-secondary btn-sm" style={{ marginTop: 12 }}>Register</TrackedLink>
                </li>
              ))}
            </ul>
          )}
          <h2 style={{ marginTop: 40 }}>What to expect</h2>
          <ol className="pathway">
            <li><strong>Register</strong><br />Name, age, phone (optional) and consent.</li>
            <li><strong>Questionnaire</strong><br />Nine short questions, about two minutes.</li>
            <li><strong>Check-in</strong><br />Staff confirm it is you.</li>
            <li><strong>Examination</strong><br />A clinician looks inside your mouth.</li>
            <li><strong>Next steps</strong><br />Clear guidance and referral if needed.</li>
          </ol>
        </div>
      </section>
      <RelatedLinks page="camps" />
    </>
  );
}
