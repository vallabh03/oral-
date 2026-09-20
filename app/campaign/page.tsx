import { T, LanguageSelector } from "@/app/language";
import {
  ArrowRight,
  ArrowUpRight,
  ClipboardList,
  HeartHandshake,
  LockKeyhole,
  Mail,
  ShieldCheck,
  Stethoscope,
  UserCheck,
} from "lucide-react";
import { runtime, db } from "@/lib/server";
import "./landing.css";

export const dynamic = "force-dynamic";

/*
 * Public campaign page. Copy stays within the approved DRIVE SAFE v1.0
 * framework: no diagnostic claims, no outcome statistics, no invented
 * contact details. Contact details render only when configured.
 */

const warningSigns = [
  "A mouth ulcer or sore that does not heal",
  "A white or red patch inside the mouth",
  "Reduced mouth opening",
  "Persistent pain or burning in the mouth",
  "A lump or swelling in the mouth or neck",
  "Difficulty or pain while swallowing",
];

const steps = [
  {
    icon: ClipboardList,
    title: "Register and give consent",
    text: "Share a few basic details and read how your information is used. Participation is voluntary.",
  },
  {
    icon: UserCheck,
    title: "Answer a short questionnaire",
    text: "About two minutes of questions on tobacco or areca-nut use and any mouth symptoms.",
  },
  {
    icon: Stethoscope,
    title: "Oral examination",
    text: "An authorised clinician examines your mouth and explains what they see.",
  },
  {
    icon: HeartHandshake,
    title: "Guidance and next steps",
    text: "You receive advice and, where needed, a referral, support to quit, or a follow-up plan.",
  },
];

const afterRegistration = [
  [
    "You receive a participant ID",
    "A random reference number is created for you. It does not contain your name or phone number.",
  ],
  [
    "Your responses are recorded",
    "The screening team uses them, together with the examination, to guide your next step.",
  ],
  [
    "A clinician decides the next step",
    "Any referral, testing or treatment is decided by qualified medical professionals — never by the software alone.",
  ],
  [
    "We may contact you to follow up",
    "Only if follow-up is needed, and only by authorised programme staff.",
  ],
];

const programmes = [
  ["DRIVE SAFE", "Auto, taxi and app-based cab drivers", "Pilot"],
  ["BUILD SAFE", "Construction workforce", "Planned"],
  ["NEXTGEN SAFE", "Colleges, ITIs and young adults", "Planned"],
  ["WORKPLACE SAFE", "Corporate and industrial workplaces", "Planned"],
];

function Mark() {
  return (
    <svg viewBox="0 0 40 40" aria-hidden="true" className="tl-mark">
      <rect
        x="1"
        y="1"
        width="38"
        height="38"
        rx="10"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
      />
      <path
        d="M11 24c3-5 6-7 9-7s6 2 9 7"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
      />
      <circle cx="20" cy="12.5" r="2.4" fill="var(--tl-accent)" />
    </svg>
  );
}

export default async function Campaign() {
  const env = runtime();
  const programme = await db()
    .prepare("SELECT value FROM app_settings WHERE id='programme'")
    .first<{ value: string }>();
  const contactSettings = programme ? JSON.parse(programme.value) : {};
  const contactEmail =
    contactSettings.supportEmail || env.CONTACT_EMAIL?.trim();
  const contactPhone =
    contactSettings.supportPhone || env.CONTACT_PHONE?.trim();
  const liveIntake = env.PUBLIC_INTAKE_ENABLED === "true";
  const upcoming = liveIntake ? (await db().prepare("SELECT name,location,date FROM camps WHERE tenant='live' AND date>=? ORDER BY date LIMIT 12").bind(new Date().toISOString().slice(0,10)).all<{name:string;location:string;date:string}>()).results : [];

  return (
    <div className="tl">
      <div className="tl-contact-strip"><div className="tl-wrap">
        <span><T>Telangana, India</T></span>
        {contactPhone && <a href={`tel:${contactPhone.replace(/\s/g, "")}`} dir="ltr">{contactPhone}</a>}
        {contactEmail && <a href={`mailto:${contactEmail}`} dir="ltr">{contactEmail}</a>}
        <a href="#help"><T>Support the programme</T></a>
      </div></div>
      <a className="tl-skip" href="#main"><T text={"Skip to content"} /></a>
      <header className="tl-header">
        <div className="tl-wrap tl-header-row">
          <LanguageSelector />
          <a
            className="tl-brand"
            href="/"
            aria-label="Telangana Against Oral Cancer — home"
          >
            <Mark />
            <span><T text={"Telangana"} /><br />
              <small><T text={"Against Oral Cancer"} /></small>
            </span>
          </a>
          <nav aria-label="Main" className="tl-nav">
            <a href="#about"><T text={"About"} /></a>
            <a href="#learn"><T text={"Oral cancer"} /></a>
            <a href="#process"><T text={"How it works"} /></a>
            <a href="#contact"><T text={"Contact"} /></a>
          </nav>
          <a className="tl-staff" href="/workspace">
            <LockKeyhole size={15} aria-hidden="true" /><T text={" Staff sign-in"} /></a>
        </div>
      </header>

      <main id="main">
        <section className="tl-hero tl-wrap" aria-labelledby="hero-title">
          <p className="tl-eyebrow"><T text={"Prevent · Detect early · Act early"} /></p>
          <h1 id="hero-title"><T text={"Early Awareness."} /><br /><T text={"Early Screening."} /><br />
            <span><T text={"Better Care."} /></span>
          </h1>
          <p className="tl-lead"><T text={"Take the first step toward oral health awareness through our screening and follow-up program."} /></p>
          <div className="tl-actions">
            <a className="tl-btn tl-btn-primary" href="/register"><T text={"Register for screening "} /><ArrowRight size={18} aria-hidden="true" />
            </a>
            <a className="tl-btn tl-btn-ghost" href="#learn"><T text={"Learn about oral cancer"} /></a>
          </div>
          {!liveIntake && (
            <p className="tl-note" role="note"><T text={"Registration currently opens in pilot mode with fictional data only. Live registration will be available at programme screening events."} /></p>
          )}
          <ul className="tl-assurances" aria-label="Programme principles">
            <li>
              <ShieldCheck size={18} aria-hidden="true" /><T text={" Voluntary and consent-based"} /></li>
            <li>
              <Stethoscope size={18} aria-hidden="true" /><T text={" Examination by clinicians"} /></li>
            <li>
              <LockKeyhole size={18} aria-hidden="true" /><T text={" Records restricted to authorised staff"} /></li>
          </ul>
        </section>

        <section
          id="about"
          className="tl-section tl-alt"
          aria-labelledby="about-title"
        >
          <div className="tl-wrap tl-split">
            <div>
              <p className="tl-eyebrow"><T text={"About the campaign"} /></p>
              <h2 id="about-title"><T text={"A state-wide initiative for prevention, early recognition and timely care."} /></h2>
            </div>
            <div className="tl-prose">
              <p><T text={"Telangana Against Oral Cancer brings oral health awareness, tobacco and areca-nut cessation support, clinical screening and follow-up to communities across the state."} clinical /></p>
              <p><T text={"Outreach programmes take screening to workplaces and communities where it can be hard to find time for a health check. These programmes do not suggest that any group is solely at risk."} /></p>
              <p className="tl-founder"><T text={"Founded & led by "} /><strong><T text={"Dr Abhinav Thaduri"} /></strong>
                <span><T text={"Head & Neck Surgical Oncologist"} /></span>
              </p>
            </div>
          </div>
        </section>

        <section
          id="learn"
          className="tl-section"
          aria-labelledby="learn-title"
        >
          <div className="tl-wrap">
            <p className="tl-eyebrow"><T text={"Why screening matters"} /></p>
            <h2 id="learn-title"><T text={"Some mouth changes are worth having checked."} /></h2>
            <div className="tl-split tl-split-top">
              <div className="tl-prose">
                <p><T text={"Tobacco in any form — smoking or chewing — and areca nut (supari, pan masala) can increase the risk of oral cancer. Some changes in the mouth may be noticed before a person has any pain."} clinical /></p>
                <p><T text={"A screening examination helps identify changes that need a closer look by a specialist."} />{" "}
                  <strong><T text={"Screening is not a diagnosis."} /></strong><T text={" It does not confirm or rule out cancer and does not replace a complete medical evaluation."} clinical /></p>
              </div>
              <div className="tl-card">
                <h3><T text={"See a doctor if any of these last more than two weeks"} /></h3>
                <ul className="tl-checklist">
                  {warningSigns.map((sign) => (
                    <li key={sign}>{sign}</li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        </section>

        <section className="tl-section tl-alt" aria-labelledby="who-title">
          <div className="tl-wrap tl-split">
            <div>
              <p className="tl-eyebrow"><T text={"Who can participate"} /></p>
              <h2 id="who-title"><T text={"Adults attending a programme screening event."} /></h2>
            </div>
            <div>
              <div className="tl-prose">
                <p><T text={"You can take part whether or not you use tobacco or areca nut. People without these habits can still have mouth changes that need to be checked."} clinical /></p>
              </div>
              <ul className="tl-programmes">
                {programmes.map(([name, who, status]) => (
                  <li key={name}>
                    <strong>{name}</strong>
                    <span><T text={who} /></span>
                    <em data-status={status.toLowerCase()}><T text={status} /></em>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </section>

        <section
          id="process"
          className="tl-section"
          aria-labelledby="process-title"
        >
          <div className="tl-wrap">
            <p className="tl-eyebrow"><T text={"How the screening works"} /></p>
            <h2 id="process-title"><T text={"One visit, four steps."} /></h2>
            <ol className="tl-steps">
              {steps.map(({ icon: Icon, title, text }, i) => (
                <li key={title}>
                  <span className="tl-step-num">
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <Icon size={22} aria-hidden="true" />
                  <h3><T text={title} clinical /></h3>
                  <p><T text={text} clinical /></p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        <section className="tl-section tl-alt" aria-labelledby="after-title">
          <div className="tl-wrap tl-split">
            <div>
              <p className="tl-eyebrow"><T text={"After registration"} /></p>
              <h2 id="after-title"><T text={"What happens next."} /></h2>
            </div>
            <dl className="tl-after">
              {afterRegistration.map(([term, desc]) => (
                <div key={term}>
                  <dt><T text={term} /></dt>
                  <dd><T text={desc} clinical /></dd>
                </div>
              ))}
            </dl>
          </div>
        </section>

        <section className="tl-section tl-cta" aria-labelledby="cta-title">
          <div className="tl-wrap">
            <h2 id="cta-title"><T text={"Ready to take the first step?"} /></h2>
            <p><T text={"Registration takes about a minute. The questionnaire takes about two."} /></p>
            <a className="tl-btn tl-btn-light" href="/register"><T text={"Register for screening "} /><ArrowRight size={18} aria-hidden="true" />
            </a>
          </div>
        </section>

        <section
          id="contact"
          className="tl-section"
          aria-labelledby="contact-title"
        >
          <div className="tl-wrap tl-split">
            <div>
              <p className="tl-eyebrow"><T text={"Contact"} /></p>
              <h2 id="contact-title"><T text={"Questions or need help?"} /></h2>
            </div>
            <div className="tl-prose">
              {contactEmail || contactPhone ? (
                <ul className="tl-contact">
                  {contactPhone && (
                    <li>
                      <span><T text={"Phone"} /></span>
                      <a href={`tel:${contactPhone.replace(/\s/g, "")}`}>
                        {contactPhone}
                      </a>
                    </li>
                  )}
                  {contactEmail && (
                    <li>
                      <span><T text={"Email"} /></span>
                      <a href={`mailto:${contactEmail}`}>
                        <Mail size={15} aria-hidden="true" /> {contactEmail}
                      </a>
                    </li>
                  )}
                </ul>
              ) : (
                <p><T text={"Programme contact details will be published here before live registration opens. At a screening event, please ask the registration desk or programme coordinator."} /></p>
              )}
              <p className="tl-small"><T text={"If you have a mouth symptom that worries you, please see a doctor. Do not wait for a screening event."} clinical /></p>
            </div>
          </div>
        </section>
        <section id="help" className="tl-section tl-alt" aria-labelledby="help-title">
          <div className="tl-wrap">
            <p className="tl-eyebrow"><T>Get involved</T></p>
            <h2 id="help-title"><T>How can you help?</T></h2>
            <div className="tl-support-grid">
              <div className="tl-support-cards">
                {[
                  ["Donate", "Help support awareness, screening and follow-up. Contact the programme team about approved ways to contribute."],
                  ["Volunteer", "Support camp coordination, community outreach and language assistance. Tell us how you would like to help."],
                  ["Collaborate", "Driver associations, employers and community partners can help organise local screening events."],
                ].map(([title,description]) => <article className="tl-support-card" key={title}>
                  <HeartHandshake size={28} aria-hidden="true" />
                  <div><h3><T text={title} /></h3><p><T text={description} /></p>
                    <a href={contactEmail ? `mailto:${contactEmail}?subject=${encodeURIComponent("DRIVE SAFE — " + title)}` : "#contact"}><T>Contact the programme team</T> <ArrowUpRight size={16} aria-hidden="true" /></a>
                  </div>
                </article>)}
              </div>
              <aside id="camps" className="tl-camp-panel">
                <p className="tl-eyebrow"><T>Meet us in your community</T></p>
                <h3><T>Upcoming camps</T></h3>
                {upcoming.length ? <ul>{upcoming.map(c => <li key={c.date+c.name}><time dateTime={c.date}>{c.date}</time><div><strong>{c.name}</strong><p>{c.location}</p></div></li>)}</ul> : <div className="tl-camp-empty"><ClipboardList size={32} aria-hidden="true" /><p><T>New camp dates will be announced here.</T></p><p><T>Contact the programme team to discuss hosting a screening camp in your area.</T></p></div>}
                <a className="tl-btn tl-btn-primary" href={contactEmail ? `mailto:${contactEmail}?subject=DRIVE%20SAFE%20camp%20enquiry` : "#contact"}><T>Host or sponsor a camp</T></a>
              </aside>
            </div>
          </div>
        </section>
      </main>

      <footer className="tl-footer">
        <div className="tl-wrap tl-footer-columns">
          <div><Mark /><h3><T>Telangana Against Oral Cancer</T></h3><p><T>Community awareness, screening and coordinated follow-up through DRIVE SAFE.</T></p></div>
          <nav aria-label="Footer links"><h3><T>Quick links</T></h3><a href="#about"><T>About</T></a><a href="#process"><T>How it works</T></a><a href="/register"><T>Registration</T></a><a href="/workspace"><T>Staff sign-in</T></a></nav>
          <div><h3><T>Programmes</T></h3>{programmes.map(([name,who,status]) => <p key={name}>{name}<small><T text={status} /> · <T text={who} /></small></p>)}</div>
          <div><h3><T>Contact</T></h3><p><T>Telangana, India</T></p>{contactPhone && <p><a dir="ltr" href={`tel:${contactPhone.replace(/\s/g, "")}`}>{contactPhone}</a></p>}{contactEmail && <p><a dir="ltr" href={`mailto:${contactEmail}`}>{contactEmail}</a></p>}{!contactPhone && !contactEmail && <p><T>Contact details will be available before live registration opens.</T></p>}<a href="#help"><T>Volunteer or collaborate</T></a></div>
        </div>
        <div className="tl-wrap tl-footer-row">
          <span>
            © {new Date().getFullYear()}<T text={" Telangana Against Oral Cancer"} /></span>
          <span><T text={"Screening supports, and does not replace, medical evaluation."} clinical /></span>
          <a href="/workspace"><T text={"Staff sign-in "} /><ArrowUpRight size={14} aria-hidden="true" />
          </a>
        </div>
      </footer>
    </div>
  );
}
