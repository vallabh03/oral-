// Privacy-safe conversion events (PRD §10.2). Payloads are a strict allowlist: event name,
// a public path and sanitised UTM values. No names, mobiles, IDs, answers or clinical data.

export const ANALYTICS_EVENTS = [
  "campaign_view",
  "register_cta_clicked",
  "registration_started",
  "registration_completed",
  "camp_info_viewed",
  "contact_submitted",
] as const;
export type AnalyticsEvent = (typeof ANALYTICS_EVENTS)[number];

export const UTM_KEYS = ["utm_source", "utm_medium", "utm_campaign"] as const;
export type Utm = Partial<Record<(typeof UTM_KEYS)[number], string>>;

/** Lower-cases and strips everything except [a-z0-9._-]; caps length. Empty → undefined. */
export function sanitizeUtmValue(v: unknown): string | undefined {
  if (typeof v !== "string") return undefined;
  const clean = v.toLowerCase().replace(/[^a-z0-9._-]/g, "").slice(0, 64);
  return clean || undefined;
}

export function extractUtm(search: string | URLSearchParams): Utm {
  const params = typeof search === "string" ? new URLSearchParams(search) : search;
  const out: Utm = {};
  for (const k of UTM_KEYS) {
    const v = sanitizeUtmValue(params.get(k));
    if (v) out[k] = v;
  }
  return out;
}

/** Only public, non-parameterised paths may be reported. Private areas are never tracked. */
export function sanitizeTrackedPath(path: unknown): string | null {
  if (typeof path !== "string" || !path.startsWith("/") || path.length > 120) return null;
  const pathname = path.split(/[?#]/)[0]!;
  if (/^\/(workspace|api|register\/status)/.test(pathname)) return null;
  if (!/^[a-z0-9/_-]*$/.test(pathname)) return null;
  return pathname;
}
