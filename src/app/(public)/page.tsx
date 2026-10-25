import Link from "next/link";
import { PAGES, SITE, WARNING_SIGNS } from "@/content/site";
import { pageMetadata, webPageJsonLd } from "@/lib/seo";
import { JsonLd } from "@/components/JsonLd";
import { Icon } from "@/components/Icon";
import { TrackedLink, TrackView } from "@/components/client/Track";
import { config } from "@/lib/server/config";

export const metadata = pageMetadata("home");

const PROGRAMMES = [
  { key: "drive-safe" as const, audience: "Auto, taxi and app-based cab drivers", status: "Pilot" },
  { key: "build-safe" as const, audience: "Construction workforce", status: "Planned" },
  { key: "nextgen-safe" as const, audience: "Colleges, ITIs and young adults", status: "Planned" },
  { key: "workplace-safe" as const, audience: "Corporate and industrial workplaces", status: "Planned" },
];

const STEPS = [
  { icon: "user", title: "Register and give consent", text: "Share a few basic details and read how your information is used. Participation is voluntary." },
  { icon: "inbox", title: "Answer a short questionnaire", text: "About two minutes of questions on tobacco or areca-nut use and any mouth symptoms." },
  { icon: "eye", title: "Oral examination", text: "An authorised clinician examines your mouth and explains what they see." },
  { icon: "shield", title: "Guidance and next steps", text: "You receive advice and, where needed, a referral, support to quit, or a follow-up plan." },
];

const NEXT = [
  { title: "You receive a participant ID", text: "A reference number is created for you. It does not contain your name or phone number." },
  { title: "Your responses are recorded", text: "The screening team uses them, together with the examination, to guide your next step." },
  { title: "A clinician decides the next step", text: "Any referral, testing or treatment is decided by qualified medical professionals — never by the software alone." },
  { title: "We may contact you to follow up", text: "Only if follow-up is needed, only if you agreed, and only by authorised programme staff." },
];

const HELP = [
  { icon: "chat", title: "Donate", text: "Help support awareness, screening and follow-up. Contact the programme team about approved ways to contribute.", href: "/partner" },
  { icon: "users", title: "Volunteer", text: "Support camp coordination, community outreach and language assistance. Tell us how you would like to help.", href: "/contact" },
  { icon: "map", title: "Collaborate", text: "Driver associations, employers and community partners can help organise local screening events.", href: "/partner" },
];

export default function HomePage() {
  const intakeOpen = config().INTAKE_ENABLED;
  return (
    <>
      <TrackView event="campaign_view" />
      <JsonLd data={webPageJsonLd("home")} />

      <section className="tl-hero">
        <div className="container fade-in">
          <span className="eyebrow">Prevent · Detect early · Act early</span>
          <h1 className="hero-title">Early Awareness.<br />Early Screening.<br />Better Care.</h1>
          <p className="lede">Oral cancer prevention and free screening across Telangana. Take the first step toward oral health awareness through our screening and follow-up programme.</p>
          <div className="cluster" style={{ marginTop: 28 }}>
            <TrackedLink event="register_cta_clicked" href="/register" className="btn btn-primary">Register for screening <span aria-hidden="true">→</span></TrackedLink>
            <Link href="/know-oral-cancer" className="btn btn-secondary">Learn about oral cancer</Link>
          </div>
          {!intakeOpen && <p className="hint" style={{ marginTop: 14, maxWidth: "52ch" }}>Live registration will open at programme screening events. Contact us to be notified.</p>}
          <ul className="trust-row" aria-label="Our commitments">
            <li><Icon name="check" size={16} /> Voluntary and consent-based</li>
            <li><Icon name="eye" size={16} /> Examination by clinicians</li>
            <li><Icon name="shield" size={16} /> Records restricted to authorised staff</li>
          </ul>
        </div>
      </section>

      <section className="section section-alt" id="about" aria-labelledby="about-h">
        <div className="container two-col">
          <div>
            <span className="eyebrow">About the campaign</span>
            <h2 id="about-h">A state-wide initiative for prevention, early recognition and timely care.</h2>
          </div>
          <div className="prose">
            <p>{SITE.name} brings oral health awareness, tobacco and areca-nut cessation support, clinical screening and follow-up to communities across the state.</p>
            <p>Outreach programmes take screening to workplaces and communities where it can be hard to find time for a health check. These programmes do not suggest that any group is solely at risk.</p>
            <div className="founder">
              <span className="hint">Founded &amp; led by</span>
              <strong>{SITE.founder.name}</strong>
              <span className="hint">{SITE.founder.role}</span>
            </div>
            <p style={{ marginTop: 16 }}><Link href="/about">More about the initiative →</Link></p>
          </div>
        </div>
      </section>

      <section className="section" id="learn" aria-labelledby="learn-h">
        <div className="container two-col">
          <div>
            <span className="eyebrow">Why screening matters</span>
            <h2 id="learn-h">Some mouth changes are worth having checked.</h2>
            <div className="prose">
              <p>Tobacco in any form — smoking or chewing — and areca nut (supari, pan masala) can increase the risk of oral cancer. Some changes in the mouth may be noticed before a person has any pain.</p>
              <p>A screening examination helps identify changes that need a closer look by a specialist. <strong>Screening is not a diagnosis.</strong> It does not confirm or rule out cancer and does not replace a complete medical evaluation.</p>
            </div>
          </div>
          <div className="panel">
            <h3>See a doctor if any of these last more than two weeks</h3>
            <ul className="dot-list">
              {WARNING_SIGNS.map((s) => <li key={s.title}>{s.title}</li>)}
            </ul>
            <p style={{ marginTop: 14, marginBottom: 0 }}><Link href="/know-oral-cancer">Warning signs and risk factors →</Link></p>
          </div>
        </div>
      </section>

      <section className="section section-alt" aria-labelledby="who-h">
        <div className="container two-col">
          <div>
            <span className="eyebrow">Who can participate</span>
            <h2 id="who-h">Adults attending a programme screening event.</h2>
          </div>
          <div>
            <p>You can take part whether or not you use tobacco or areca nut. People without these habits can still have mouth changes that need to be checked.</p>
            <ul className="row-list" aria-label="Outreach programmes">
              {PROGRAMMES.map((p) => (
                <li key={p.key}>
                  <Link href={PAGES[p.key].path}>
                    <span><strong>{PAGES[p.key].label}</strong><span className="hint">{p.audience}</span></span>
                    <span className={`status-pill ${p.status === "Pilot" ? "is-live" : ""}`}>{p.status}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      <section className="section" id="how-it-works" aria-labelledby="how-h">
        <div className="container">
          <span className="eyebrow">How the screening works</span>
          <h2 id="how-h">One visit, four steps.</h2>
          <ol className="step-cards">
            {STEPS.map((s, i) => (
              <li key={s.title} className="card">
                <span className="step-num">{String(i + 1).padStart(2, "0")}</span>
                <Icon name={s.icon} size={22} />
                <h3>{s.title}</h3>
                <p>{s.text}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section className="section section-alt" aria-labelledby="next-h">
        <div className="container two-col">
          <div>
            <span className="eyebrow">After registration</span>
            <h2 id="next-h">What happens next.</h2>
          </div>
          <ul className="divided-list">
            {NEXT.map((n) => <li key={n.title}><h3>{n.title}</h3><p>{n.text}</p></li>)}
          </ul>
        </div>
      </section>

      <section className="section tl-cta" aria-labelledby="cta-h">
        <div className="container">
          <h2 id="cta-h">Ready to take the first step?</h2>
          <p>Registration takes about a minute. The questionnaire takes about two.</p>
          <TrackedLink event="register_cta_clicked" href="/register" className="btn btn-inverse">Register for screening <span aria-hidden="true">→</span></TrackedLink>
        </div>
      </section>

      <section className="section" id="contact" aria-labelledby="contact-h">
        <div className="container two-col">
          <div>
            <span className="eyebrow">Contact</span>
            <h2 id="contact-h">Questions or need help?</h2>
          </div>
          <div>
            <p>Programme contact details will be published here before live registration opens. At a screening event, please ask the registration desk or programme coordinator. You can also <Link href="/contact">send us a message</Link>.</p>
            <p className="hint">If you have a mouth symptom that worries you, please see a doctor. Do not wait for a screening event.</p>
          </div>
        </div>
      </section>

      <section className="section section-alt" id="help" aria-labelledby="help-h">
        <div className="container">
          <span className="eyebrow">Get involved</span>
          <h2 id="help-h">How can you help?</h2>
          <div className="help-grid">
            <ul className="help-cards">
              {HELP.map((h) => (
                <li key={h.title} className="card accent-card">
                  <Icon name={h.icon} size={20} />
                  <h3>{h.title}</h3>
                  <p>{h.text}</p>
                  <Link href={h.href}>Contact the programme team <span aria-hidden="true">↗</span></Link>
                </li>
              ))}
            </ul>
            <div className="card">
              <span className="eyebrow">Meet us in your community</span>
              <h3>Upcoming camps</h3>
              <Icon name="map" size={22} />
              <p>New camp dates will be announced on the camps page.</p>
              <p>Contact the programme team to discuss hosting a screening camp in your area.</p>
              <div className="cluster">
                <Link href="/camps" className="btn btn-primary btn-block">See upcoming camps</Link>
                <Link href="/partner" className="btn btn-secondary btn-block">Host or sponsor a camp</Link>
              </div>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
