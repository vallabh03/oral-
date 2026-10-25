import Link from "next/link";
import type { Metadata } from "next";
import { SiteFooter, SiteHeader } from "@/components/SiteChrome";
import { CookieConsent } from "@/components/client/CookieConsent";

export const metadata: Metadata = { title: "Page not found", robots: { index: false, follow: true } };

/** Custom 404 (FR-PUB-10): clear explanation and safe links; no internal route details. */
export default function NotFound() {
  return (
    <>
      <SiteHeader />
      <main id="main" tabIndex={-1} className="section">
        <div className="container" style={{ maxWidth: 760 }}>
          <span className="eyebrow">Error 404</span>
          <h1>We couldn&apos;t find that page</h1>
          <p className="lede">The link may be out of date, or the page may have moved. Here are some places to go instead:</p>
          <ul className="grid" style={{ "--min": "200px", listStyle: "none", padding: 0, marginTop: 24 } as React.CSSProperties}>
            <li><Link className="card card-link" href="/"><h2 style={{ fontSize: "var(--step-1)" }}>Home</h2><p style={{ margin: 0, color: "var(--muted)" }}>Start again from the homepage.</p></Link></li>
            <li><Link className="card card-link" href="/register"><h2 style={{ fontSize: "var(--step-1)" }}>Register</h2><p style={{ margin: 0, color: "var(--muted)" }}>Sign up for free screening.</p></Link></li>
            <li><Link className="card card-link" href="/camps"><h2 style={{ fontSize: "var(--step-1)" }}>Screening camps</h2><p style={{ margin: 0, color: "var(--muted)" }}>Where and when to get examined.</p></Link></li>
            <li><Link className="card card-link" href="/contact"><h2 style={{ fontSize: "var(--step-1)" }}>Support</h2><p style={{ margin: 0, color: "var(--muted)" }}>Ask the programme team.</p></Link></li>
          </ul>
          <form className="search-form" action="/search" role="search" style={{ marginTop: 32 }}>
            <label htmlFor="nf-q" className="visually-hidden">Search the website</label>
            <input id="nf-q" type="search" name="q" placeholder="Search the website" maxLength={80} />
            <button type="submit" className="btn btn-primary">Search</button>
          </form>
        </div>
      </main>
      <SiteFooter />
      <CookieConsent />
    </>
  );
}
