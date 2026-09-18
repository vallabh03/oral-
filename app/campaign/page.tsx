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
import { runtime } from "@/lib/server";
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
  ["You receive a participant ID", "A random reference number is created for you. It does not contain your name or phone number."],
  ["Your responses are recorded", "The screening team uses them, together with the examination, to guide your next step."],
  ["A clinician decides the next step", "Any referral, testing or treatment is decided by qualified medical professionals — never by the software alone."],
  ["We may contact you to follow up", "Only if follow-up is needed, and only by authorised programme staff."],
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
      <rect x="1" y="1" width="38" height="38" rx="10" fill="none" stroke="currentColor" strokeWidth="2" />
      <path d="M11 24c3-5 6-7 9-7s6 2 9 7" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
      <circle cx="20" cy="12.5" r="2.4" fill="var(--tl-accent)" />
    </svg>
  );
}

export default function Campaign() {
  const env = runtime();
  const contactEmail = env.CONTACT_EMAIL?.trim();
  const contactPhone = env.CONTACT_PHONE?.trim();
  const liveIntake = env.PUBLIC_INTAKE_ENABLED === "true";

  return (
    <div className="tl">
      <a className="tl-skip" href="#main">Skip to content</a>
      <header className="tl-header">
        <div className="tl-wrap tl-header-row">
          <a className="tl-brand" href="/" aria-label="Telangana Against Oral Cancer — home">
            <Mark />
            <span>
              Telangana<br />
              <small>Against Oral Cancer</small>
            </span>
          </a>
          <nav aria-label="Main" className="tl-nav">
            <a href="#about">About</a>
            <a href="#learn">Oral cancer</a>
            <a href="#process">How it works</a>
            <a href="#contact">Contact</a>
          </nav>
          <a className="tl-staff" href="/workspace">
            <LockKeyhole size={15} aria-hidden="true" /> Staff sign-in
          </a>
        </div>
      </header>

      <main id="main">
        <section className="tl-hero tl-wrap" aria-labelledby="hero-title">
          <p className="tl-eyebrow">Prevent · Detect early · Act early</p>
          <h1 id="hero-title">
            Early Awareness.<br />
            Early Screening.<br />
            <span>Better Care.</span>
          </h1>
          <p className="tl-lead">
            Take the first step toward oral health awareness through our
            screening and follow-up program.
          </p>
          <div className="tl-actions">
            <a className="tl-btn tl-btn-primary" href="/register">
              Register for screening <ArrowRight size={18} aria-hidden="true" />
            </a>
            <a className="tl-btn tl-btn-ghost" href="#learn">
              Learn about oral cancer
            </a>
          </div>
          {!liveIntake && (
            <p className="tl-note" role="note">
              Registration currently opens in pilot mode with fictional data only.
              Live registration will be available at programme screening events.
            </p>
          )}
          <ul className="tl-assurances" aria-label="Programme principles">
            <li><ShieldCheck size={18} aria-hidden="true" /> Voluntary and consent-based</li>
            <li><Stethoscope size={18} aria-hidden="true" /> Examination by clinicians</li>
            <li><LockKeyhole size={18} aria-hidden="true" /> Records restricted to authorised staff</li>
          </ul>
        </section>

        <section id="about" className="tl-section tl-alt" aria-labelledby="about-title">
          <div className="tl-wrap tl-split">
            <div>
              <p className="tl-eyebrow">About the campaign</p>
              <h2 id="about-title">A state-wide initiative for prevention, early recognition and timely care.</h2>
            </div>
            <div className="tl-prose">
              <p>
                Telangana Against Oral Cancer brings oral health awareness,
                tobacco and areca-nut cessation support, clinical screening and
                follow-up to communities across the state.
              </p>
              <p>
                Outreach programmes take screening to workplaces and communities
                where it can be hard to find time for a health check. These
                programmes do not suggest that any group is solely at risk.
              </p>
              <p className="tl-founder">
                Founded &amp; led by <strong>Dr Abhinav Thaduri</strong>
                <span>Head &amp; Neck Surgical Oncologist</span>
              </p>
            </div>
          </div>
        </section>

        <section id="learn" className="tl-section" aria-labelledby="learn-title">
          <div className="tl-wrap">
            <p className="tl-eyebrow">Why screening matters</p>
            <h2 id="learn-title">Some mouth changes are worth having checked.</h2>
            <div className="tl-split tl-split-top">
              <div className="tl-prose">
                <p>
                  Tobacco in any form — smoking or chewing — and areca nut
                  (supari, pan masala) can increase the risk of oral cancer.
                  Some changes in the mouth may be noticed before a person has
                  any pain.
                </p>
                <p>
                  A screening examination helps identify changes that need a
                  closer look by a specialist. <strong>Screening is not a
                  diagnosis.</strong> It does not confirm or rule out cancer and
                  does not replace a complete medical evaluation.
                </p>
              </div>
              <div className="tl-card">
                <h3>See a doctor if any of these last more than two weeks</h3>
                <ul className="tl-checklist">
                  {warningSigns.map((sign) => <li key={sign}>{sign}</li>)}
                </ul>
              </div>
            </div>
          </div>
        </section>

        <section className="tl-section tl-alt" aria-labelledby="who-title">
          <div className="tl-wrap tl-split">
            <div>
              <p className="tl-eyebrow">Who can participate</p>
              <h2 id="who-title">Adults attending a programme screening event.</h2>
            </div>
            <div>
              <div className="tl-prose">
                <p>
                  You can take part whether or not you use tobacco or areca nut.
                  People without these habits can still have mouth changes that
                  need to be checked.
                </p>
              </div>
              <ul className="tl-programmes">
                {programmes.map(([name, who, status]) => (
                  <li key={name}>
                    <strong>{name}</strong>
                    <span>{who}</span>
                    <em data-status={status.toLowerCase()}>{status}</em>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </section>

        <section id="process" className="tl-section" aria-labelledby="process-title">
          <div className="tl-wrap">
            <p className="tl-eyebrow">How the screening works</p>
            <h2 id="process-title">One visit, four steps.</h2>
            <ol className="tl-steps">
              {steps.map(({ icon: Icon, title, text }, i) => (
                <li key={title}>
                  <span className="tl-step-num">{String(i + 1).padStart(2, "0")}</span>
                  <Icon size={22} aria-hidden="true" />
                  <h3>{title}</h3>
                  <p>{text}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        <section className="tl-section tl-alt" aria-labelledby="after-title">
          <div className="tl-wrap tl-split">
            <div>
              <p className="tl-eyebrow">After registration</p>
              <h2 id="after-title">What happens next.</h2>
            </div>
            <dl className="tl-after">
              {afterRegistration.map(([term, desc]) => (
                <div key={term}>
                  <dt>{term}</dt>
                  <dd>{desc}</dd>
                </div>
              ))}
            </dl>
          </div>
        </section>

        <section className="tl-section tl-cta" aria-labelledby="cta-title">
          <div className="tl-wrap">
            <h2 id="cta-title">Ready to take the first step?</h2>
            <p>Registration takes about a minute. The questionnaire takes about two.</p>
            <a className="tl-btn tl-btn-light" href="/register">
              Register for screening <ArrowRight size={18} aria-hidden="true" />
            </a>
          </div>
        </section>

        <section id="contact" className="tl-section" aria-labelledby="contact-title">
          <div className="tl-wrap tl-split">
            <div>
              <p className="tl-eyebrow">Contact</p>
              <h2 id="contact-title">Questions or need help?</h2>
            </div>
            <div className="tl-prose">
              {contactEmail || contactPhone ? (
                <ul className="tl-contact">
                  {contactPhone && <li><span>Phone</span><a href={`tel:${contactPhone.replace(/\s/g, "")}`}>{contactPhone}</a></li>}
                  {contactEmail && <li><span>Email</span><a href={`mailto:${contactEmail}`}><Mail size={15} aria-hidden="true" /> {contactEmail}</a></li>}
                </ul>
              ) : (
                <p>
                  Programme contact details will be published here before live
                  registration opens. At a screening event, please ask the
                  registration desk or programme coordinator.
                </p>
              )}
              <p className="tl-small">
                If you have a mouth symptom that worries you, please see a
                doctor. Do not wait for a screening event.
              </p>
            </div>
          </div>
        </section>
      </main>

      <footer className="tl-footer">
        <div className="tl-wrap tl-footer-row">
          <span>© {new Date().getFullYear()} Telangana Against Oral Cancer</span>
          <span>Screening supports, and does not replace, medical evaluation.</span>
          <a href="/workspace">Staff sign-in <ArrowUpRight size={14} aria-hidden="true" /></a>
        </div>
      </footer>
    </div>
  );
}
