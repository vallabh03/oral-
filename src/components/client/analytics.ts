"use client";
import { extractUtm, sanitizeTrackedPath, type AnalyticsEvent, type Utm } from "@/lib/shared/analytics";

export type ConsentPrefs = { essential: true; analytics: boolean; decidedAt: string; version: 1 };
const COOKIE = "cookie_prefs";

export function readConsent(): ConsentPrefs | null {
  if (typeof document === "undefined") return null;
  const raw = document.cookie.split("; ").find((c) => c.startsWith(COOKIE + "="))?.slice(COOKIE.length + 1);
  if (!raw) return null;
  try {
    const p = JSON.parse(decodeURIComponent(raw)) as ConsentPrefs;
    return p.version === 1 ? p : null;
  } catch {
    return null;
  }
}

export function writeConsent(analytics: boolean) {
  const prefs: ConsentPrefs = { essential: true, analytics, decidedAt: new Date().toISOString(), version: 1 };
  const secure = location.protocol === "https:" ? "; Secure" : "";
  document.cookie = `${COOKIE}=${encodeURIComponent(JSON.stringify(prefs))}; Max-Age=${60 * 60 * 24 * 180}; Path=/; SameSite=Lax${secure}`;
  if (!analytics) {
    try {
      sessionStorage.removeItem("utm");
    } catch {}
  }
  window.dispatchEvent(new CustomEvent("app:consent", { detail: prefs }));
}

/** Captures sanitised UTM values for this visit (session only). */
export function captureUtm() {
  const utm = extractUtm(location.search);
  if (Object.keys(utm).length) {
    try {
      sessionStorage.setItem("utm", JSON.stringify(utm));
    } catch {}
  }
}

function storedUtm(): Utm {
  try {
    return JSON.parse(sessionStorage.getItem("utm") ?? "{}") as Utm;
  } catch {
    return {};
  }
}

/**
 * Sends a conversion event only when the visitor has opted in to analytics. The payload is
 * an allowlisted name, the public path and UTM values — never personal or health data.
 */
export function track(name: AnalyticsEvent) {
  if (!readConsent()?.analytics) return;
  const path = sanitizeTrackedPath(location.pathname);
  if (!path) return;
  const body = JSON.stringify({ name, path, ...storedUtm() });
  // keepalive lets the request finish even if the user navigates away (like sendBeacon).
  void fetch("/api/events", { method: "POST", body, headers: { "content-type": "application/json" }, keepalive: true, credentials: "omit" }).catch(() => {});
}
