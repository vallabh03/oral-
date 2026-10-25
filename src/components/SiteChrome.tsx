import Link from "next/link";
import { MAIN_NAV, PAGES, SITE, type PageKey } from "@/content/site";
import { breadcrumbJsonLd, breadcrumbTrail } from "@/lib/seo";
import { Icon } from "./Icon";
import { Logo } from "./Logo";
import { JsonLd } from "./JsonLd";
import { DesktopNavLinks, MobileNav } from "./client/MobileNav";
import { ThemeToggle } from "./client/ThemeToggle";
import { CookiePrefsButton } from "./client/CookieConsent";
import { CopyButton, PrintButton } from "./client/CopyButton";
import { TrackedLink } from "./client/Track";

// Primary navigation (desktop) mirrors the campaign site; the mobile menu adds every public page.
const navItems = [
  { href: "/about", label: "About" },
  { href: "/know-oral-cancer", label: "Oral cancer" },
  { href: "/#how-it-works", label: "How it works" },
  { href: "/programs", label: "Programmes" },
  { href: "/camps", label: "Camps" },
  { href: "/contact", label: "Contact" },
];
const mobileItems = [...MAIN_NAV.map((k) => ({ href: PAGES[k].path, label: PAGES[k].label }))];

export function SiteHeader() {
  return (
    <>
      <div className="utility-bar no-print">
        <div className="container-wide utility-inner">
          <span>Telangana, India</span>
          <Link href="/partner">Support the programme</Link>
        </div>
      </div>
      <header className="site-header">
        <div className="container-wide bar">
          <Link href="/" className="brand">
            <Logo priority />
          </Link>
          <nav className="nav-desktop" aria-label="Main">
            <DesktopNavLinks items={navItems} />
          </nav>
          <div className="header-actions">
            <Link href="/search" className="icon-btn header-search" aria-label="Search the website"><Icon name="search" /></Link>
            <ThemeToggle />
            <Link href="/workspace/login" rel="nofollow" className="btn btn-primary btn-sm header-register"><Icon name="user" size={16} /> Staff sign-in</Link>
            <MobileNav items={mobileItems} />
          </div>
        </div>
      </header>
    </>
  );
}

const PROGRAMME_LINKS: { key: PageKey; note: string }[] = [
  { key: "drive-safe", note: "Pilot · Auto, taxi and app-based cab drivers" },
  { key: "build-safe", note: "Planned · Construction workforce" },
  { key: "nextgen-safe", note: "Planned · Colleges, ITIs and young adults" },
  { key: "workplace-safe", note: "Planned · Corporate and industrial workplaces" },
];

export function SiteFooter() {
  return (
    <footer className="site-footer">
      <div className="container-wide">
        <div className="footer-grid">
          <div>
            <Link href="/" className="brand" style={{ marginBottom: 12 }}><Logo height={56} /></Link>
            <p style={{ color: "var(--muted)", fontSize: "0.92rem" }}>Community awareness, screening and coordinated follow-up through DRIVE SAFE.</p>
            <p style={{ color: "var(--muted)", fontSize: "0.85rem" }}>Founded &amp; led by {SITE.founder.name}, {SITE.founder.role}.</p>
          </div>
          <nav aria-label="Quick links">
            <h2>Quick links</h2>
            <ul>
              <li><Link href="/about">About</Link></li>
              <li><Link href="/#how-it-works">How it works</Link></li>
              <li><Link href="/know-oral-cancer">Oral cancer</Link></li>
              <li><Link href="/register">Registration</Link></li>
              <li><Link href="/faq">FAQ</Link></li>
              <li><Link href="/get-help">Get help</Link></li>
              <li><Link href="/healthcare-professionals">For professionals</Link></li>
            </ul>
          </nav>
          <nav aria-label="Programmes">
            <h2>Programmes</h2>
            <ul>
              {PROGRAMME_LINKS.map((p) => (
                <li key={p.key}><Link href={PAGES[p.key].path}>{PAGES[p.key].label}</Link><span className="footer-note">{p.note}</span></li>
              ))}
            </ul>
          </nav>
          <nav aria-label="Contact and privacy">
            <h2>Contact</h2>
            <ul>
              <li>Telangana, India</li>
              <li className="footer-note">Contact details will be available before live registration opens.</li>
              <li><Link href="/contact">Volunteer or collaborate</Link></li>
              <li><Link href="/privacy">Privacy notice</Link></li>
              <li><Link href="/cookies">Cookie policy</Link> · <CookiePrefsButton /></li>
            </ul>
          </nav>
        </div>
        <div className="footer-bottom">
          <p>© {new Date().getFullYear()} {SITE.name}</p>
          <p>Screening supports, and does not replace, medical evaluation.</p>
          <Link href="/workspace/login" rel="nofollow">Staff sign-in →</Link>
        </div>
      </div>
    </footer>
  );
}

export function Breadcrumbs({ page }: { page: PageKey }) {
  const trail = breadcrumbTrail(page);
  return (
    <>
      <nav className="breadcrumbs" aria-label="Breadcrumb">
        <ol>
          {trail.map((c, i) => (
            <li key={c.path}>{i === trail.length - 1 ? <span aria-current="page">{c.name}</span> : <Link href={c.path}>{c.name}</Link>}</li>
          ))}
        </ol>
      </nav>
      <JsonLd data={breadcrumbJsonLd(page)} />
    </>
  );
}

export function LastUpdated({ date }: { date: string }) {
  const d = new Date(date + "T00:00:00Z");
  return <span>Last updated <time dateTime={date}>{d.toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" })}</time></span>;
}

export function PageHeader({ page, eyebrow, children }: { page: PageKey; eyebrow?: string; children?: React.ReactNode }) {
  const p = PAGES[page];
  return (
    <div className="page-head">
      <div className="container">
        <Breadcrumbs page={page} />
        <div style={{ marginTop: 20 }}>
          {eyebrow && <span className="eyebrow">{eyebrow}</span>}
          <h1>{p.label === "FAQ" ? "Frequently asked questions" : headingFor(page)}</h1>
          {children}
          <div className="meta-line no-print" style={{ marginTop: 12 }}>
            <LastUpdated date={p.updated} />
            <span className="cluster" style={{ gap: 8 }}>
              <CopyButton value="__CURRENT_URL__" label="Copy link" what="Page link" />
              <PrintButton />
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

const HEADINGS: Partial<Record<PageKey, string>> = {
  about: "About the initiative",
  know: "Oral cancer warning signs and risk factors",
  "drive-safe": "DRIVE SAFE: free oral screening for drivers",
  "build-safe": "BUILD SAFE: screening for construction workers",
  "nextgen-safe": "NEXTGEN SAFE: tobacco prevention for young people",
  "workplace-safe": "WORKPLACE SAFE: prevention at work",
  programs: "Outreach programmes",
  "get-help": "Get help",
  professionals: "For healthcare professionals",
  partner: "Partner with us",
  impact: "Our impact",
  camps: "Free oral screening camps near you",
  contact: "Contact us",
  privacy: "Privacy notice",
  cookies: "Cookie policy",
};
function headingFor(k: PageKey) {
  return HEADINGS[k] ?? PAGES[k].label;
}

export function RelatedLinks({ page }: { page: PageKey }) {
  const rel = PAGES[page].related ?? [];
  if (!rel.length) return null;
  return (
    <aside className="section-tight section-alt no-print" aria-labelledby="related-h">
      <div className="container">
        <h2 id="related-h" style={{ fontSize: "var(--step-2)" }}>Related pages</h2>
        <ul className="grid" style={{ "--min": "220px", listStyle: "none", padding: 0 } as React.CSSProperties}>
          {rel.map((k) => (
            <li key={k}>
              <Link className="card card-link" href={PAGES[k].path}>
                <h3>{PAGES[k].label}</h3>
                <p style={{ color: "var(--muted)", margin: 0, fontSize: "0.95rem" }}>{PAGES[k].description}</p>
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </aside>
  );
}

export function FloatingContact() {
  return (
    <Link href="/contact" className="floating-contact no-print">
      <Icon name="chat" /> <span>Contact us</span>
    </Link>
  );
}

export function EmptyState({ title, children, icon = "inbox" }: { title: string; children?: React.ReactNode; icon?: string }) {
  return (
    <div className="empty-state" role="status">
      <Icon name={icon} size={56} />
      <h3>{title}</h3>
      {children}
    </div>
  );
}

export function Skeleton({ lines = 3, height = 18 }: { lines?: number; height?: number }) {
  return (
    <div aria-hidden="true" className="stack" style={{ "--stack": "10px" } as React.CSSProperties}>
      {Array.from({ length: lines }, (_, i) => <div key={i} className="skeleton" style={{ height, width: `${92 - i * 11}%` }} />)}
    </div>
  );
}
