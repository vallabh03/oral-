import {
  Activity,
  ArrowRight,
  ArrowUpRight,
  ShieldCheck,
  ClipboardList,
  Stethoscope,
  HeartHandshake,
  Check,
  Plus,
  MoveUpRight,
} from "lucide-react";

const steps = [
  {
    icon: ClipboardList,
    title: "A little about you",
    text: "Give your consent, register and answer a brief questionnaire about your oral health.",
    note: "Registration + questionnaire",
  },
  {
    icon: Stethoscope,
    title: "A clinician takes a look",
    text: "An authorised clinical professional examines your mouth and explains the findings.",
    note: "Oral examination",
  },
  {
    icon: HeartHandshake,
    title: "Leave with a next step",
    text: "Receive guidance and, where appropriate, support to quit tobacco or areca nut, a referral or follow-up.",
    note: "Guidance + continued care",
  },
];
const questions = [
  [
    "Who is DRIVE SAFE for?",
    "The pilot programme is designed for auto, cab/taxi and app-based cab drivers. The screening team can explain participation at your programme event.",
  ],
  [
    "What happens during the visit?",
    "You give consent, complete registration and a short questionnaire, then meet a clinician for an oral examination. The team explains any findings and appropriate next steps.",
  ],
  [
    "Does screening diagnose cancer?",
    "No. Screening does not confirm a cancer diagnosis or replace a complete medical evaluation. An abnormal finding may require specialist assessment and further evaluation.",
  ],
  [
    "Do I need to use tobacco to participate?",
    "No. The programme includes drivers with and without tobacco or areca-nut habits. The clinician assesses oral findings regardless of habit history.",
  ],
  [
    "How is my information used?",
    "The programme collects information for screening and appropriate follow-up. Clinical records are restricted to authorised staff. Live registration will open only after the programme finalises its privacy notice and consent wording.",
  ],
  [
    "Can I register right now?",
    "This website is currently a private pilot evaluation. You can explore the registration workflow using fictional information. Live participant intake and confirmed camp details are not yet available.",
  ],
];

function DriverArtwork() {
  return (
    <svg
      viewBox="0 0 560 500"
      role="img"
      aria-label="Illustration of an auto rickshaw on a road, celebrating Telangana’s drivers"
    >
      <circle cx="315" cy="225" r="181" fill="#efb46c" />
      <circle cx="445" cy="92" r="28" fill="#fae8c9" />
      <path d="M32 349 Q 233 283 520 366 L560 500H0Z" fill="#244c43" />
      <path
        d="M0 417 Q258 319 560 437"
        fill="none"
        stroke="#f8e4bd"
        strokeWidth="4"
        strokeDasharray="26 22"
      />
      <g fill="#d8a05b" opacity=".65">
        <path d="M100 289V196h24v-28h13v28h24v93zM173 288v-87h42v-20h16v20h28v87zM427 291v-119h39v-22h12v22h21v119z" />
      </g>
      <g transform="translate(91 120)">
        <ellipse
          cx="208"
          cy="237"
          rx="180"
          ry="19"
          fill="#163b34"
          opacity=".24"
        />
        <path
          d="M61 65Q61 36 92 36h140q22 0 34 23l39 83 47 21v62H44V121Z"
          fill="#f5c74c"
          stroke="#183e36"
          strokeWidth="5"
          strokeLinejoin="round"
        />
        <path d="M62 68h197l-12-22q-4-10-20-10H92q-28 0-30 32" fill="#193d35" />
        <path
          d="M185 77h72l31 70H185Z"
          fill="#dcebdd"
          stroke="#183e36"
          strokeWidth="5"
        />
        <path d="M75 78h86v91H64v-44Z" fill="#224b40" />
        <path d="M120 83v80M80 167h80" stroke="#efb956" strokeWidth="5" />
        <path d="M182 159h112l54 18v45H47v-42h133Z" fill="#3c7860" />
        <path d="M181 160v62M46 199h302" stroke="#183e36" strokeWidth="4" />
        <circle cx="105" cy="226" r="34" fill="#193b34" />
        <circle cx="105" cy="226" r="15" fill="#ece4cd" />
        <circle cx="291" cy="226" r="34" fill="#193b34" />
        <circle cx="291" cy="226" r="15" fill="#ece4cd" />
        <rect x="319" y="172" width="23" height="15" rx="4" fill="#fff3c7" />
        <path
          d="M285 111h23v31M198 137l43-48"
          stroke="#183e36"
          strokeWidth="4"
          strokeLinecap="round"
        />
        <rect x="73" y="181" width="84" height="14" rx="3" fill="#e9d7a8" />
        <text
          x="115"
          y="191"
          fill="#254d40"
          fontSize="9"
          fontWeight="bold"
          textAnchor="middle"
        >
          DRIVE SAFE
        </text>
      </g>
      <path
        d="M45 288v-55m-1 17q-36-24-20-39 27 4 21 39m2 18q35-32 40-12-9 22-40 12"
        fill="#41684b"
        stroke="#41684b"
        strokeWidth="4"
      />
      <g fill="#fff8e9">
        <path
          d="M360 65v23m-11-12h23M89 114v15m-7-8h15"
          stroke="#fff8e9"
          strokeWidth="3"
        />
      </g>
    </svg>
  );
}

export default function Campaign() {
  return (
    <div className="tg-landing">
      <a className="tg-skip" href="#main">
        Skip to content
      </a>
      <div className="tg-status">
        <span /> DRIVE SAFE PILOT <span className="tg-status-divider">/</span>{" "}
        Preview today. Care for tomorrow.
      </div>
      <header className="tg-header">
        <a
          className="tg-brand"
          href="/"
          aria-label="Telangana Against Oral Cancer home"
        >
          <span className="tg-brand-icon">
            <Activity size={27} />
          </span>
          <span>
            TELANGANA<small>AGAINST ORAL CANCER</small>
          </span>
        </a>
        <nav aria-label="Main navigation">
          <a href="#programme">Our programme</a>
          <a href="#journey">Your visit</a>
          <a href="#questions">FAQs</a>
        </nav>
        <a className="tg-staff" href="/workspace">
          Staff workspace <ArrowUpRight size={16} />
        </a>
      </header>
      <main id="main">
        <section className="tg-hero tg-wrap">
          <div className="tg-hero-copy">
            <p className="tg-kicker">
              <span /> SMALL STEPS. HEALTHIER JOURNEYS.
            </p>
            <h1>
              You keep Telangana moving.
              <br />
              <em>Let’s care for you.</em>
            </h1>
            <p className="tg-lead">
              Meet DRIVE SAFE. Oral health awareness, screening and guidance for
              the people behind the wheel.
            </p>
            <div className="tg-actions">
              <a className="tg-button" href="/register">
                Explore registration <ArrowUpRight size={20} />
              </a>
              <a className="tg-text-link" href="#journey">
                How it works <ArrowRight size={18} />
              </a>
            </div>
            <p className="tg-pilot-note">
              Pilot evaluation · Live registration is not yet open
            </p>
          </div>
          <div className="tg-art">
            <div className="tg-art-label">
              <span>AN INITIATIVE FOR</span>
              <strong>
                Every driver.
                <br />
                Every journey.
              </strong>
            </div>
            <DriverArtwork />
            <div className="tg-art-caption">
              <span className="tg-art-dot" /> AUTO · TAXI · APP-BASED CAB
            </div>
            <div className="tg-art-stamp">
              <HeartHandshake size={22} />
              <span>
                People first.
                <br />
                <b>Always.</b>
              </span>
            </div>
          </div>
        </section>
        <div className="tg-values">
          <div className="tg-wrap">
            <span>
              <ShieldCheck /> Voluntary & consent-led
            </span>
            <span>
              <Stethoscope /> Clinician-led screening
            </span>
            <span>
              <HeartHandshake /> Guidance beyond the visit
            </span>
          </div>
        </div>
        <section className="tg-wrap tg-intro" id="programme">
          <div>
            <p className="tg-kicker">A HEALTHIER ROAD AHEAD</p>
            <h2>
              A little time for your health.
              <br />A meaningful step forward.
            </h2>
          </div>
          <div>
            <p>
              Long days. Busy roads. Your health deserves a place in the
              schedule, too.
            </p>
            <p>
              Telangana Against Oral Cancer brings together awareness and
              clinician-led screening through DRIVE SAFE. A brief questionnaire,
              an oral examination and clear guidance connect you to the next
              step in care.
            </p>
            <a className="tg-text-link" href="#questions">
              Get to know the programme <ArrowRight size={18} />
            </a>
          </div>
        </section>
        <section className="tg-journey" id="journey">
          <div className="tg-wrap">
            <div className="tg-section-heading">
              <div>
                <p className="tg-kicker">YOUR SCREENING JOURNEY</p>
                <h2>One visit. Three simple steps.</h2>
              </div>
              <p>
                Know what to expect,
                <br />
                before you arrive.
              </p>
            </div>
            <div className="tg-steps">
              {steps.map(({ icon: Icon, title, text, note }, i) => (
                <article key={title}>
                  <div className="tg-step-top">
                    <Icon size={28} />
                    <span>0{i + 1}</span>
                  </div>
                  <h3>{title}</h3>
                  <p>{text}</p>
                  <small>{note}</small>
                </article>
              ))}
            </div>
          </div>
        </section>
        <section className="tg-wrap tg-prepare">
          <div className="tg-prepare-copy">
            <p className="tg-kicker">COME WITH QUESTIONS</p>
            <h2>
              Your visit.
              <br />
              Your choice.
              <br />
              <em>Your peace of mind.</em>
            </h2>
            <p>
              The team is there to listen, explain the screening and help you
              understand what happens next.
            </p>
          </div>
          <div className="tg-checklist">
            <h3>A few things to know</h3>
            {[
              "Participation starts with your informed consent.",
              "Tell the clinician about any oral changes or concerns.",
              "You can ask about support to stop tobacco or areca-nut use.",
              "Screening is not a confirmed cancer diagnosis.",
            ].map((x) => (
              <div key={x}>
                <span>
                  <Check size={17} />
                </span>
                <p>{x}</p>
              </div>
            ))}
            <a className="tg-text-link" href="#questions">
              More answers below <ArrowRight size={18} />
            </a>
          </div>
        </section>
        <section className="tg-faq tg-wrap" id="questions">
          <div>
            <p className="tg-kicker">LET’S MAKE IT CLEAR</p>
            <h2>
              A few questions.
              <br />
              Helpful answers.
            </h2>
            <p>
              Start here, then speak with the programme coordinator at your
              screening event.
            </p>
          </div>
          <div className="tg-faq-list">
            {questions.map(([q, a]) => (
              <details key={q}>
                <summary>
                  {q}
                  <Plus size={20} />
                </summary>
                <p>{a}</p>
              </details>
            ))}
          </div>
        </section>
        <section className="tg-wrap">
          <div className="tg-cta">
            <div>
              <p className="tg-kicker">THE FIRST STEP IS A SMALL ONE</p>
              <h2>
                Make your health
                <br />
                part of the journey.
              </h2>
              <p>
                Explore the pilot registration experience with fictional
                information.
              </p>
            </div>
            <a className="tg-button tg-button-light" href="/register">
              Explore registration <MoveUpRight size={22} />
            </a>
          </div>
        </section>
      </main>
      <footer className="tg-wrap tg-footer">
        <div className="tg-footer-main">
          <a className="tg-brand" href="/">
            <span className="tg-brand-icon">
              <Activity size={25} />
            </span>
            <span>
              TELANGANA<small>AGAINST ORAL CANCER</small>
            </span>
          </a>
          <p>For the people who keep us moving.</p>
          <a href="/workspace">
            Staff workspace <ArrowUpRight size={16} />
          </a>
        </div>
        <div className="tg-footer-bottom">
          <span>DRIVE SAFE · Pilot programme</span>
          <span>
            Screening supports care. It does not replace a complete medical
            evaluation.
          </span>
        </div>
      </footer>
    </div>
  );
}
