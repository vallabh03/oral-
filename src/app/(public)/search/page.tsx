import Link from "next/link";
import { searchSite } from "@/content/search";
import { pageMetadata } from "@/lib/seo";
import { EmptyState } from "@/components/SiteChrome";

export const metadata = pageMetadata("search");

export default async function SearchPage({ searchParams }: { searchParams: Promise<{ q?: string | string[] }> }) {
  const raw = (await searchParams).q;
  const q = (Array.isArray(raw) ? raw[0] : raw)?.slice(0, 80).trim() ?? "";
  const results = q ? searchSite(q) : [];
  return (
    <section className="section">
      <div className="container" style={{ maxWidth: 860 }}>
        <h1>Search</h1>
        <form className="search-form" action="/search" role="search" style={{ margin: "16px 0 28px" }}>
          <label htmlFor="q" className="visually-hidden">Search the website</label>
          <input id="q" type="search" name="q" defaultValue={q} placeholder="e.g. warning signs, camps, quit tobacco" maxLength={80} autoFocus={!q} />
          <button type="submit" className="btn btn-primary">Search</button>
        </form>
        {q && (
          <p role="status" className="hint">{results.length ? `${results.length} result${results.length === 1 ? "" : "s"} for “${q}”` : ""}</p>
        )}
        {q && results.length === 0 ? (
          <EmptyState title={`No results for “${q}”`} icon="search">
            <p>Try fewer or different words, or browse <Link href="/know-oral-cancer">warning signs</Link>, <Link href="/camps">camps</Link> or the <Link href="/faq">FAQ</Link>.</p>
          </EmptyState>
        ) : (
          <ol style={{ listStyle: "none", padding: 0 }} className="stack">
            {results.map((r) => (
              <li key={r.url + r.title} className="card">
                <span className="badge">{r.kind}</span>
                <h2 style={{ fontSize: "var(--step-1)", marginTop: 8 }}><Link href={r.url}>{r.title}</Link></h2>
                <p style={{ margin: 0, color: "var(--muted)" }}>{r.text}</p>
              </li>
            ))}
          </ol>
        )}
        {!q && <p className="hint">Search covers public pages, FAQs and programme information only.</p>}
      </div>
    </section>
  );
}
