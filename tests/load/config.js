// Shared settings for the k6 load tests. Everything can be overridden with environment variables:
//
//   k6 run -e BASE_URL=https://staging.example.org -e VUS=10 tests/load/load.js
//
// See tests/load/README.md for every option. Only synthetic data is ever sent.

export const env = (name, fallback) => (__ENV[name] !== undefined && __ENV[name] !== "" ? __ENV[name] : fallback);
export const num = (name, fallback) => Number(env(name, fallback));
/** "1h30m", "90s", "2m" → seconds. */
export function seconds(d) {
  let total = 0;
  for (const [, n, u] of String(d).matchAll(/(\d+(?:\.\d+)?)(ms|h|m|s)/g)) total += Number(n) * { h: 3600, m: 60, s: 1, ms: 0.001 }[u];
  return total;
}

export const BASE_URL = env("BASE_URL", "http://localhost:3000").replace(/\/+$/, "");
const host = BASE_URL.replace(/^https?:\/\//, "").split(/[/:]/)[0].toLowerCase();

/** The live site: a single 4 GB Lightsail server holding real participant data. */
export const PRODUCTION_HOSTS = ["telanganaagainstoralcancer.com", "www.telanganaagainstoralcancer.com"];
export const IS_PRODUCTION = PRODUCTION_HOSTS.includes(host);
/** Local targets (the app started with `next start` / `next dev` on this machine or CI runner). */
export const IS_LOCAL = host === "localhost" || host === "127.0.0.1" || host === "[::1]" || host.endsWith(".localhost");

/**
 * Write traffic (registrations, questionnaires, staff sign-in) is never sent to production.
 * Elsewhere it is on by default; set WRITES=false for a read-only run.
 */
export const WRITES = !IS_PRODUCTION && env("WRITES", "true") !== "false";

/**
 * Locally the app trusts the right-most X-Forwarded-For entry (TRUSTED_PROXY_HOPS=1, no proxy in
 * front), so each virtual user can present its own synthetic IP and the per-IP rate limits behave
 * as they would for many different phones. Behind Caddy/CloudFront this header is replaced by the
 * proxy, so it is only sent to local targets.
 */
export const SPOOF_IPS = IS_LOCAL && env("SPOOF_IPS", "true") !== "false";

// Each test has its own defaults for VUS / DURATION / P95_MS / MAX_FAIL_RATE; these env vars override them.

/** Staff account. Pre-made session (STAFF_SESSION + STAFF_CSRF) wins over email/password/TOTP. */
export const STAFF = {
  session: env("STAFF_SESSION", env("AUTH_TOKEN", "")),
  csrf: env("STAFF_CSRF", ""),
  email: env("STAFF_EMAIL", "doctor@example.test"),
  password: env("STAFF_PASSWORD", ""),
  totpSecret: env("STAFF_TOTP_SECRET", ""),
  enabled: env("STAFF", "true") !== "false",
};

// Fill password/TOTP from the synthetic credentials file written by `npm run seed:dev`
// (.dev-credentials.json) or `npm run e2e:prepare` (.e2e-credentials.json). Never real accounts.
if (!STAFF.session && (!STAFF.password || !STAFF.totpSecret) && !IS_PRODUCTION) {
  const files = [env("CREDENTIALS_FILE", ""), "../../.dev-credentials.json", "../../.e2e-credentials.json"].filter(Boolean);
  for (const f of files) {
    try {
      const creds = JSON.parse(open(f));
      const u = (creds.users || []).find((x) => x.email === STAFF.email);
      if (u) {
        STAFF.password = STAFF.password || u.password;
        STAFF.totpSecret = STAFF.totpSecret || u.totpSecret;
        break;
      }
    } catch (_) {
      // file not present — try the next one
    }
  }
}

export const STAFF_READY = !IS_PRODUCTION && STAFF.enabled && (!!STAFF.session || (!!STAFF.password && !!STAFF.totpSecret));

/** Cookie names: production builds use the __Host- prefix (NODE_ENV=production + APP_ENV=production). */
export const STAFF_COOKIE = env("STAFF_COOKIE", "ds_session");
export const INTAKE_COOKIE = env("INTAKE_COOKIE", "ds_intake");

/** Virtual-screening staff queue (server needs VIRTUAL_SCREENING_ENABLED=true). */
export const VIRTUAL = env("VIRTUAL", "true") !== "false";

export const REPORT_DIR = env("REPORT_DIR", "tests/load/reports");

export const PUBLIC_PAGES = ["/", "/virtual-screening", "/camps", "/faq"];

/**
 * Refuses dangerous runs. Heavy tests (load/stress/soak) never run against the live site;
 * the smoke test may, but only read-only (public pages + health).
 */
export function guardTarget(kind) {
  if (IS_PRODUCTION && kind !== "smoke") {
    throw new Error(
      `Refusing to run the ${kind} test against ${BASE_URL}: the live site is a single 4 GB server with real participant data. ` +
        "Use a local server or a staging copy (see tests/load/README.md).",
    );
  }
}
