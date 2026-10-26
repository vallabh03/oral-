// Public, non-sensitive website content. All health wording here is DRAFT and must be approved
// by the programme's clinical owner before launch (PRD §10.3). No statistics, outcomes,
// testimonials or partner claims are invented — those sections stay empty until supplied.

export const SITE = {
  name: "Telangana Against Oral Cancer",
  shortName: "TAOC",
  tagline: "Prevent. Detect Early. Act Early.",
  description:
    "A public-health initiative for oral cancer prevention, tobacco cessation support, early recognition of suspicious mouth changes and timely specialist care.",
  founder: { name: "Dr Abhinav Thaduri", role: "Head & Neck Surgical Oncologist" },
  areaServed: ["Telangana", "Hyderabad"],
  locale: "en_IN",
  contentUpdated: "2026-10-24",
};

export type PageKey =
  | "home" | "about" | "know" | "programs" | "drive-safe" | "build-safe" | "nextgen-safe" | "workplace-safe" | "get-help"
  | "professionals" | "partner" | "impact" | "camps" | "virtual" | "faq" | "contact" | "privacy" | "cookies" | "search" | "register";

export type PageMeta = {
  path: string;
  title: string;
  /** Short label for navigation and breadcrumbs. */
  label: string;
  description: string;
  updated: string;
  parent?: PageKey;
  indexable: boolean;
  related?: PageKey[];
  ogTitle?: string;
};

export const PAGES: Record<PageKey, PageMeta> = {
  home: {
    path: "/", label: "Home", indexable: true, updated: "2026-10-24",
    title: "Oral Cancer Prevention & Free Screening in Telangana",
    description: "Know the warning signs, get help to quit tobacco or areca nut, and register for free oral screening camps across Telangana. Led by a head and neck surgeon.",
    related: ["know", "programs", "camps", "get-help"],
    ogTitle: "Prevent. Detect Early. Act Early.",
  },
  about: {
    path: "/about", label: "About", indexable: true, updated: "2026-10-24",
    title: "About Us: Mission, Founder and Programme Model",
    description: "Why Telangana Against Oral Cancer exists, who leads it, and how prevention, screening, referral and follow-up connect into one continuous pathway.",
    related: ["programs", "professionals", "partner"],
  },
  know: {
    path: "/know-oral-cancer", label: "Know Oral Cancer", indexable: true, updated: "2026-10-24",
    title: "Oral Cancer Warning Signs & Risk Factors",
    description: "Learn the mouth changes that should be checked, how tobacco, gutkha and areca nut raise risk, and why a sore lasting more than two weeks needs an examination.",
    related: ["get-help", "camps", "faq"],
    ogTitle: "Know the warning signs",
  },
  programs: {
    path: "/programs", label: "Programmes", indexable: true, updated: "2026-10-24",
    title: "Oral Cancer Outreach Programmes in Telangana",
    description: "Four outreach arms take prevention and early detection to transport workers, construction sites, colleges and workplaces across Telangana.",
    related: ["drive-safe", "camps", "partner"],
  },
  "drive-safe": {
    path: "/programs/drive-safe", label: "DRIVE SAFE", parent: "programs", indexable: true, updated: "2026-10-24",
    title: "DRIVE SAFE: Free Oral Screening for Drivers",
    description: "DRIVE SAFE offers auto, taxi and cab drivers a short registration, a two-minute questionnaire, an oral examination by a clinician and clear next steps.",
    related: ["camps", "know", "get-help"],
    ogTitle: "DRIVE SAFE screening for drivers",
  },
  "build-safe": {
    path: "/programs/build-safe", label: "BUILD SAFE", parent: "programs", indexable: false, updated: "2026-10-24",
    title: "BUILD SAFE: Screening for Construction Workers",
    description: "BUILD SAFE is the planned worksite programme for prevention, oral screening and linkage to care for the construction workforce.",
    related: ["programs", "partner"],
  },
  "nextgen-safe": {
    path: "/programs/nextgen-safe", label: "NEXTGEN SAFE", parent: "programs", indexable: false, updated: "2026-10-24",
    title: "NEXTGEN SAFE: Tobacco Prevention for Students",
    description: "NEXTGEN SAFE is the planned programme for colleges, ITIs and young adults focused on preventing tobacco initiation and early cessation.",
    related: ["programs", "partner"],
  },
  "workplace-safe": {
    path: "/programs/workplace-safe", label: "WORKPLACE SAFE", parent: "programs", indexable: false, updated: "2026-10-24",
    title: "WORKPLACE SAFE: Oral Cancer Prevention at Work",
    description: "WORKPLACE SAFE is the planned programme bringing prevention education and early detection into corporate and industrial workplaces.",
    related: ["programs", "partner"],
  },
  "get-help": {
    path: "/get-help", label: "Get Help", indexable: true, updated: "2026-10-24",
    title: "Get Help: Screening, Mouth Changes, Quitting Tobacco",
    description: "What to do if you have a mouth change that worries you, how to get screened, and where to get support to stop tobacco or areca nut.",
    related: ["know", "camps", "contact"],
  },
  professionals: {
    path: "/healthcare-professionals", label: "For Professionals", indexable: true, updated: "2026-10-24",
    title: "Oral Lesion Referral Pathway for Clinicians",
    description: "How clinicians and health workers can refer people with suspicious oral lesions into the programme's specialist evaluation pathway.",
    related: ["contact", "about"],
  },
  partner: {
    path: "/partner", label: "Partner With Us", indexable: true, updated: "2026-10-24",
    title: "Partner With Us: Employers, Colleges and CSR",
    description: "Organisations can host screening, share prevention messages or support the programme as clinical, outreach, CSR or knowledge partners.",
    related: ["programs", "contact"],
  },
  impact: {
    path: "/impact", label: "Impact", indexable: false, updated: "2026-10-24",
    title: "Our Impact: Reach, Screening and Follow-up",
    description: "The measures the programme will publish once verified: people reached, screened, referred and supported to quit tobacco.",
    related: ["about", "programs"],
  },
  camps: {
    path: "/camps", label: "Screening Camps", indexable: true, updated: "2026-10-24",
    title: "Free Oral Cancer Screening Camps in Telangana",
    description: "Find upcoming DRIVE SAFE oral screening camps. Register in about a minute, answer a short questionnaire and get a clinician examination with clear next steps.",
    related: ["drive-safe", "faq", "register"],
  },
  virtual: {
    path: "/virtual-screening", label: "Virtual Screening", indexable: true, updated: "2026-10-26",
    title: "Virtual Oral Cancer Screening from Home",
    description: "Cannot reach a camp? Register online, answer a short questionnaire and talk with the programme team by phone or video. We book an examination if needed.",
    related: ["camps", "faq", "register"],
  },
  faq: {
    path: "/faq", label: "FAQ", indexable: true, updated: "2026-10-24",
    title: "Oral Cancer Screening FAQs",
    description: "Answers about who can be screened, what happens at a camp, whether it hurts, how your data is protected and what the result means.",
    related: ["camps", "privacy", "know"],
  },
  contact: {
    path: "/contact", label: "Contact", indexable: true, updated: "2026-10-24",
    title: "Contact the Programme Team",
    description: "Send a question about screening, quitting tobacco, partnerships or professional referrals to the Telangana Against Oral Cancer team.",
    related: ["faq", "partner"],
  },
  privacy: {
    path: "/privacy", label: "Privacy", indexable: true, updated: "2026-10-24",
    title: "Privacy Notice: How Participant Data Is Protected",
    description: "What the programme collects, why, who can see it, how long it is kept and how to withdraw consent or request a correction.",
    related: ["cookies", "faq"],
  },
  cookies: {
    path: "/cookies", label: "Cookies", indexable: true, updated: "2026-10-24",
    title: "Cookie Policy and Preferences",
    description: "Which cookies the website uses, which are essential, and how to change your optional analytics choice at any time.",
    related: ["privacy"],
  },
  search: {
    path: "/search", label: "Search", indexable: false, updated: "2026-10-24",
    title: "Search the website",
    description: "Search public programme pages, FAQs and camp information.",
  },
  register: {
    path: "/register", label: "Register", indexable: false, updated: "2026-10-24",
    title: "Register for DRIVE SAFE screening",
    description: "Register for oral health screening and complete a two-minute questionnaire.",
  },
};

export const MAIN_NAV: PageKey[] = ["about", "know", "programs", "camps", "get-help", "professionals", "partner", "faq", "contact"];

export const WARNING_SIGNS = [
  { title: "A mouth ulcer or sore that does not heal", detail: "Especially one lasting more than two weeks." },
  { title: "A white or red patch", detail: "On the gums, tongue, cheek lining or floor of the mouth." },
  { title: "Difficulty opening the mouth", detail: "Stiffness or tight bands inside the cheeks." },
  { title: "A lump, thickening or swelling", detail: "In the mouth, jaw or neck." },
  { title: "Pain or burning that does not go away", detail: "Or unexplained bleeding or numbness." },
  { title: "Difficulty or pain while swallowing", detail: "Or a change in voice that persists." },
];

export const RISK_FACTORS = [
  "Smoking cigarettes or bidi",
  "Chewing tobacco, gutkha, khaini or zarda",
  "Pan with tobacco",
  "Supari / areca nut and pan masala — even without tobacco",
  "Alcohol, especially together with tobacco",
];

export const PROGRAMS = [
  { key: "drive-safe" as const, name: "DRIVE SAFE", audience: "Auto, taxi, cab and transport workforce", status: "Pilot", summary: "Prevention, tobacco-risk assessment, oral examination and referral at driver stands and associations.", image: "/images/programme-drive.jpg" },
  { key: "build-safe" as const, name: "BUILD SAFE", audience: "Construction workforce", status: "Planned", summary: "Worksite-based prevention, screening and linkage to care.", image: "/images/programme-build.jpg" },
  { key: "nextgen-safe" as const, name: "NEXTGEN SAFE", audience: "Colleges, ITIs, trainees and young adults", status: "Planned", summary: "Preventing tobacco initiation, early cessation and self-awareness.", image: "/images/programme-nextgen.jpg" },
  { key: "workplace-safe" as const, name: "WORKPLACE SAFE", audience: "Corporate and industrial workplaces", status: "Planned", summary: "Workplace prevention, education and early detection.", image: "/images/programme-workplace.jpg" },
];

export const FAQS = [
  { q: "Who can register for DRIVE SAFE screening?", a: "Auto, taxi and cab drivers and others in the transport workforce can register (minimum age to be confirmed by the programme). Registration takes under a minute and the questionnaire about two minutes." },
  { q: "Does the examination hurt?", a: "No. A trained clinician looks inside your mouth and feels the neck using a light and gloves. It usually takes a few minutes and involves no needles or samples." },
  { q: "Is this a cancer test or diagnosis?", a: "No. Screening looks for mouth changes that need a closer look. It cannot confirm or rule out cancer. If anything needs attention, the clinician explains the next step and where to go." },
  { q: "Do I need to bring anything?", a: "Bring a mobile phone if you want follow-up messages. You do not need Aadhaar or any identity document, and we do not collect your home address." },
  { q: "Why do you ask for a photo?", a: "Only if you agree, staff take a photo of your face so they can find the right record when you come back for follow-up. It is stored privately, never shown publicly, and you can withdraw this consent." },
  { q: "Who can see my information?", a: "Only authorised programme clinicians and administrators, and every access is logged. Analysis reports use de-identified data without names or phone numbers." },
  { q: "What happens after the examination?", a: "The clinician verifies the findings and explains your screening category and next step — for example warning-sign education, help to quit tobacco, a planned re-check, or a referral for specialist evaluation." },
  { q: "I have a mouth ulcer that has lasted more than two weeks. What should I do?", a: "Please see a doctor or dentist soon, or attend a screening camp. A sore, patch or lump that lasts more than two weeks should always be examined." },
  { q: "Can I get help to stop tobacco or supari?", a: "Yes. Tell the camp team you would like help, or use the contact form. The programme will connect you with cessation support." },
  { q: "How do I withdraw consent or correct my details?", a: "Ask camp staff, or contact the programme using the contact form and choose “Privacy or data request”. Optional messages stop as soon as consent is withdrawn." },
];

/**
 * Search indexing is OFF until clinical/content approval is recorded (INDEXING_ENABLED=true).
 * While off, every page is noindex, robots.txt disallows everything and the review banner shows.
 */
export function indexingEnabled(): boolean {
  return process.env.INDEXING_ENABLED === "true";
}

export function absoluteUrl(path: string): string {
  const raw = process.env.NEXT_PUBLIC_SITE_URL;
  if (["production", "staging"].includes(process.env.APP_ENV ?? "") && (!raw || !raw.startsWith("https://"))) {
    throw new Error("NEXT_PUBLIC_SITE_URL must be an https URL for canonical links");
  }
  const base = (raw || "http://localhost:3000").replace(/\/$/, "");
  return base + (path === "/" ? "/" : path);
}
