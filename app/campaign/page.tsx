import {
  Activity,
  ArrowRight,
  ShieldCheck,
  ClipboardList,
  Stethoscope,
  HeartHandshake,
} from "lucide-react";
export default function Campaign() {
  return (
    <div className="campaign">
      <header className="campaign-header">
        <a className="brand" href="/campaign">
          <span className="brand-mark">
            <Activity />
          </span>
          <span>
            HYDERABAD<span>AGAINST ORAL CANCER</span>
          </span>
        </a>
        <nav>
          <a href="#about">The programme</a>
          <a href="#process">What to expect</a>
          <a className="secondary" href="/">
            Staff workspace <ArrowRight size={16} />
          </a>
        </nav>
      </header>
      <main>
        <section className="campaign-hero">
          <div>
            <p className="eyebrow">
              DRIVE SAFE · FOR HYDERABAD’S AUTO & TAXI DRIVERS
            </p>
            <h1>
              Early Awareness.
              <br />
              Early Screening.
              <br />
              <em>Better Care.</em>
            </h1>
            <p>
              Take the first step toward oral health awareness through our
              screening and follow-up program.
            </p>
            <div className="action-row">
              <a className="primary" href="/register">
                Register for screening <ArrowRight size={17} />
              </a>
              <a className="secondary" href="#awareness">
                Learn about oral cancer
              </a>
            </div>
            <p className="hero-note">
              <ShieldCheck size={16} /> Voluntary participation. Informed
              consent. Clinician-led care.
            </p>
          </div>
          <aside>
            <div className="eyebrow">YOUR ROAD TO BETTER ORAL HEALTH</div>
            <strong>
              DRIVE
              <br />
              SAFE<span>HYDERABAD</span>
            </strong>
            <div className="hero-divider" />
            <p>
              For the people
              <br />
              who keep our city moving.
            </p>
            <span className="badge">HAOC PILOT PROGRAMME</span>
          </aside>
        </section>
        <section id="about" className="campaign-section">
          <p className="eyebrow">A PROGRAMME BUILT AROUND PEOPLE</p>
          <div className="campaign-columns">
            <h2>
              Your work keeps
              <br />
              Hyderabad moving.
              <br />
              Your health matters, too.
            </h2>
            <div>
              <p>
                Hyderabad Against Oral Cancer is the umbrella initiative behind
                DRIVE SAFE, an oral health awareness and screening programme for
                auto and taxi drivers.
              </p>
              <p>
                The pilot brings registration, a brief questionnaire, an oral
                examination and appropriate guidance together in one connected
                visit. Auto drivers, cab/taxi drivers and app-based cab drivers
                can participate at programme events.
              </p>
            </div>
          </div>
        </section>
        <section id="process" className="campaign-section">
          <p className="eyebrow">WHAT TO EXPECT</p>
          <h2>A short visit. A clear next step.</h2>
          <div className="process-grid">
            {[
              [
                ClipboardList,
                "01",
                "Register & share",
                "Give your consent and complete a short questionnaire about habits, symptoms and awareness.",
              ],
              [
                Stethoscope,
                "02",
                "Meet the clinical team",
                "An authorized clinician examines your mouth and records the findings.",
              ],
              [
                HeartHandshake,
                "03",
                "Receive guidance",
                "The team explains your next steps, including cessation support, referral or follow-up where appropriate.",
              ],
            ].map(([Icon, n, title, body]: any) => (
              <article key={n}>
                <div>
                  <Icon size={24} />
                  <span>{n}</span>
                </div>
                <h3>{title}</h3>
                <p>{body}</p>
              </article>
            ))}
          </div>
        </section>
        <section id="awareness" className="campaign-section awareness">
          <div>
            <p className="eyebrow">AWARENESS IS THE FIRST STEP</p>
            <h2>
              Make space for
              <br />
              your oral health.
            </h2>
          </div>
          <div>
            <p>
              The screening visit gives you an opportunity to discuss habits and
              oral changes with a qualified clinician. Screening does not
              replace a complete medical evaluation and does not confirm a
              cancer diagnosis.
            </p>
            <p>
              The clinical team will explain any abnormal findings and whether
              specialist evaluation is appropriate. Questions about stopping
              tobacco or areca-nut use can be discussed during the visit.
            </p>
            <p className="fine">
              Programme information follows the supplied DRIVE SAFE pilot
              framework, version 1.0. Clinical protocols and participant
              information remain subject to final review.
            </p>
          </div>
        </section>
        <section className="campaign-section contact">
          <div>
            <p className="eyebrow">WE’RE HERE TO HELP</p>
            <h2>Questions before you participate?</h2>
            <p>
              Speak with the DRIVE SAFE coordinator at your screening camp about
              consent, follow-up and help with registration.
            </p>
            <p className="muted">
              Campaign phone and email will be published after the programme
              team confirms them.
            </p>
          </div>
          <a className="primary" href="/register">
            Register for screening <ArrowRight size={17} />
          </a>
        </section>
      </main>
      <footer>
        <span>HYDERABAD AGAINST ORAL CANCER · DRIVE SAFE</span>
        <span>Pilot evaluation · Live intake pending governance review</span>
      </footer>
    </div>
  );
}
