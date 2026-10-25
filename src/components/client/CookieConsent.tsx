"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { captureUtm, readConsent, writeConsent } from "./analytics";

/**
 * Simple cookie banner + preferences panel (FR-PUB-17). Essential cookies (security/session)
 * are always on; optional first-party analytics stays off until the visitor opts in.
 * No third-party or marketing tags are used at all.
 */
export function CookieConsent() {
  const [showBanner, setShowBanner] = useState(false);
  const [analytics, setAnalytics] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);
  const opener = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const prefs = readConsent();
    setShowBanner(!prefs);
    setAnalytics(!!prefs?.analytics);
    captureUtm();
    const open = () => {
      opener.current = document.activeElement as HTMLElement;
      setAnalytics(!!readConsent()?.analytics);
      dialog.current?.showModal();
    };
    window.addEventListener("app:open-cookie-prefs", open);
    return () => window.removeEventListener("app:open-cookie-prefs", open);
  }, []);

  const decide = (value: boolean) => {
    writeConsent(value);
    setAnalytics(value);
    setShowBanner(false);
    dialog.current?.close();
    window.dispatchEvent(new CustomEvent("app:toast", { detail: { message: value ? "Analytics cookies allowed. You can change this any time." : "Only essential cookies will be used.", kind: "success" } }));
  };

  return (
    <>
      {showBanner && (
        <section className="cookie-banner no-print" aria-label="Cookie choices" role="region">
          <p>
            We use essential cookies to keep the site secure. With your permission we also count page visits and registrations using our own
            privacy-safe analytics — no advertising or third-party trackers. <Link href="/cookies">Cookie policy</Link>
          </p>
          <div className="cluster">
            <button type="button" className="btn btn-primary btn-sm" onClick={() => decide(true)}>Allow analytics</button>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => decide(false)}>Essential only</button>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => { opener.current = document.activeElement as HTMLElement; dialog.current?.showModal(); }}>Preferences</button>
          </div>
        </section>
      )}
      <dialog ref={dialog} aria-labelledby="cookie-prefs-title" onClose={() => opener.current?.focus()}>
        <div className="dialog-body">
          <h2 id="cookie-prefs-title" style={{ fontSize: "var(--step-2)" }}>Cookie preferences</h2>
          <div className="toggle-row">
            <div>
              <strong>Essential</strong>
              <p className="hint">Security, sign-in and your cookie choice. Always on.</p>
            </div>
            <input type="checkbox" checked disabled aria-label="Essential cookies (always on)" />
          </div>
          <div className="toggle-row">
            <div>
              <label htmlFor="pref-analytics" style={{ margin: 0 }}>Analytics</label>
              <p className="hint">First-party counts of page views and registrations, with campaign source. No personal or health information.</p>
            </div>
            <input id="pref-analytics" type="checkbox" checked={analytics} onChange={(e) => setAnalytics(e.target.checked)} />
          </div>
          <div className="toggle-row" style={{ borderBottom: 0 }}>
            <div>
              <strong>Marketing</strong>
              <p className="hint">Not used. We do not run advertising or retargeting cookies.</p>
            </div>
            <input type="checkbox" disabled aria-label="Marketing cookies (not used)" />
          </div>
        </div>
        <div className="dialog-actions">
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => dialog.current?.close()}>Cancel</button>
          <button type="button" className="btn btn-primary btn-sm" onClick={() => decide(analytics)}>Save preferences</button>
        </div>
      </dialog>
    </>
  );
}

export function CookiePrefsButton({ className = "linklike" }: { className?: string }) {
  return (
    <button type="button" className={className} onClick={() => window.dispatchEvent(new Event("app:open-cookie-prefs"))}>
      Cookie preferences
    </button>
  );
}
