"use client";
import Link from "next/link";

// Safe user-facing error page: no stack traces, paths or framework details (checklist §19).
export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main id="main" tabIndex={-1} className="section">
      <div className="container" style={{ maxWidth: 680 }}>
        <h1>Something went wrong</h1>
        <p className="lede">Sorry — this page could not load. Your information has not been lost.</p>
        <div className="cluster">
          <button type="button" className="btn btn-primary" onClick={() => reset()}>Try again</button>
          <Link href="/" className="btn btn-ghost">Go to the homepage</Link>
        </div>
        {error.digest && <p className="hint" style={{ marginTop: 16 }}>Reference: {error.digest}</p>}
      </div>
    </main>
  );
}
