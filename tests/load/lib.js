// Shared flows and helpers for the k6 tests: synthetic participants, staff sign-in (password + TOTP),
// public browsing and the end-of-run report. Only synthetic, obviously fake data is generated.
import http from "k6/http";
import crypto from "k6/crypto";
import { check, group, sleep, fail } from "k6";
import { Counter, Trend } from "k6/metrics";
import { textSummary } from "https://jslib.k6.io/k6-summary/0.1.0/index.js";
import {
  BASE_URL, IS_LOCAL, SPOOF_IPS, STAFF, STAFF_COOKIE, STAFF_READY, PUBLIC_PAGES, REPORT_DIR, WRITES, VIRTUAL,
} from "./config.js";

export const rateLimited = new Counter("rate_limited_429");
export const registrations = new Counter("registrations_created");
export const flowDuration = new Trend("participant_flow_ms", true);

const ORIGIN = BASE_URL.match(/^https?:\/\/[^/]+/)[0];

// ---------- request helpers ----------

/**
 * A fake client address (10.x.y.z) per virtual user and iteration — like a new phone for each
 * participant — so the per-IP register limit (20/hour) is not hit locally. Local targets only.
 */
function fakeIp() {
  const iter = typeof __ITER === "undefined" ? Math.floor(Math.random() * 1e6) : __ITER; // undefined in setup()
  const n = (__VU * 100003 + iter * 7919 + 13) % 16000000;
  return `10.${(n >> 16) & 255}.${(n >> 8) & 255}.${n & 255}`;
}

export function headers(extra = {}) {
  const h = { "user-agent": "taoc-k6-loadtest", ...extra };
  if (SPOOF_IPS) h["x-forwarded-for"] = fakeIp();
  return h;
}

/** JSON POST with the Origin header the app's CSRF check expects. */
export function postJson(path, body, params = {}) {
  return http.post(`${BASE_URL}${path}`, JSON.stringify(body), {
    ...params,
    headers: headers({ "content-type": "application/json", origin: ORIGIN, ...(params.headers || {}) }),
  });
}

export function get(path, params = {}) {
  return http.get(`${BASE_URL}${path}`, { ...params, headers: headers(params.headers || {}) });
}

function count429(res) {
  if (res.status === 429) rateLimited.add(1);
  return res;
}

// ---------- synthetic data ----------

const LETTERS = "abcdefghijklmnopqrstuvwxyz";
function word(len) {
  let s = "";
  for (let i = 0; i < len; i++) s += LETTERS[Math.floor(Math.random() * LETTERS.length)];
  return s[0].toUpperCase() + s.slice(1);
}
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

/** 32 hex characters — matches the app's idempotency key format. */
export function idemKey() {
  return crypto.sha256(`${__VU}-${Date.now()}-${Math.random()}`, "hex").slice(0, 32);
}

/**
 * A synthetic in-person registration. No mobile number and no contact consent, so the app never
 * tries to send WhatsApp/SMS messages to a real phone. Names start with "Loadtest" so any record
 * that ends up in a staging database is easy to spot and delete.
 */
export function syntheticRegistration() {
  return {
    fullName: `Loadtest ${word(6)}`,
    age: 18 + Math.floor(Math.random() * 50),
    driverType: pick(["auto", "cab_taxi", "app_cab"]),
    workingArea: "Synthetic Load Test Area",
    recruitmentSource: pick(["association", "stand", "whatsapp"]),
    contactPreference: "none",
    screeningMode: "in_person",
    language: "en",
    consents: { registration: true, screening: true, followupContact: false, whatsappReport: false, photo: false },
    idempotencyKey: idemKey(),
  };
}

export const SYNTHETIC_ANSWERS = {
  habits: ["gutkha"], duration: "gt10", frequency: "gt3_packets", symptoms: ["patch"], symptom_gt_2w: "yes",
  alcohol: "no", medical_history: ["none"],
  risk_awareness: "no", sign_awareness: "no", previous_screening: "no", cessation_interest: "yes",
};
export const PARTIAL_ANSWERS = { habits: ["gutkha"], duration: "gt10" };

// ---------- flows ----------

export function healthCheck() {
  const res = get("/api/health", { tags: { name: "GET /api/health" } });
  check(res, {
    "health 200": (r) => r.status === 200,
    "health ok": (r) => r.status === 200 && r.json("status") === "ok",
  });
  return res;
}

export function browsePublic(pages = PUBLIC_PAGES, think = [1, 3]) {
  group("public pages", () => {
    for (const p of pages) {
      const res = get(p, { tags: { name: `GET ${p}` } });
      check(res, {
        [`${p} 200`]: (r) => r.status === 200,
        [`${p} is html`]: (r) => (r.headers["Content-Type"] || "").includes("text/html"),
      });
      sleep(think[0] + Math.random() * (think[1] - think[0]));
    }
  });
}

/**
 * Register → partial questionnaire save → complete questionnaire → participant status.
 * On non-local targets the app's per-IP register limit (20/hour) cannot be spread over fake IPs,
 * so a 429 there is recorded in `rate_limited_429` instead of failing the run.
 */
export function participantFlow(think = [1, 3]) {
  if (!WRITES) return;
  const t0 = Date.now();
  http.cookieJar().clear(BASE_URL);
  const pause = () => sleep(think[0] + Math.random() * (think[1] - think[0]));
  group("participant registration", () => {
    get("/register", { tags: { name: "GET /register" } });
    pause();
    const reg = count429(postJson("/api/intake/register", syntheticRegistration(), {
      tags: { name: "POST /api/intake/register" },
      responseCallback: IS_LOCAL ? undefined : http.expectedStatuses({ min: 200, max: 299 }, 429),
    }));
    const ok = check(reg, {
      "register 201": (r) => r.status === 201,
      "register returns displayId": (r) => r.status === 201 && !!r.json("displayId"),
    });
    if (!ok) {
      if (reg.status !== 429) console.warn(`register HTTP ${reg.status} ${reg.error || ""} ${String(reg.body || "").slice(0, 200)}`);
      return;
    }
    registrations.add(1);
    pause();

    const q1 = count429(postJson("/api/intake/questionnaire", { answers: PARTIAL_ANSWERS, complete: false, idempotencyKey: idemKey() }, { tags: { name: "POST /api/intake/questionnaire" } }));
    check(q1, { "questionnaire draft 2xx": (r) => r.status >= 200 && r.status < 300 });
    pause();
    const q2 = count429(postJson("/api/intake/questionnaire", { answers: SYNTHETIC_ANSWERS, complete: true, idempotencyKey: idemKey() }, { tags: { name: "POST /api/intake/questionnaire" } }));
    check(q2, { "questionnaire complete 2xx": (r) => r.status >= 200 && r.status < 300 });

    const me = get("/api/intake/me", { tags: { name: "GET /api/intake/me" } });
    check(me, { "intake/me 200": (r) => r.status === 200 });
  });
  flowDuration.add(Date.now() - t0);
}

// ---------- staff ----------

const B32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
function base32Decode(s) {
  const clean = s.replace(/=+$/, "").toUpperCase().replace(/\s/g, "");
  const out = [];
  let bits = 0;
  let value = 0;
  for (const ch of clean) {
    value = (value << 5) | B32.indexOf(ch);
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return new Uint8Array(out).buffer;
}

/** RFC 6238 TOTP (SHA-1, 30 s, 6 digits), same as src/lib/server/security/totp.ts. */
export function totp(secret, step = Math.floor(Date.now() / 30000)) {
  const counter = new Uint8Array(8);
  let c = step;
  for (let i = 7; i >= 0; i--) {
    counter[i] = c & 255;
    c = Math.floor(c / 256);
  }
  const h = new Uint8Array(crypto.hmac("sha1", base32Decode(secret), counter.buffer, "binary"));
  const o = h[h.length - 1] & 0xf;
  const code = ((h[o] & 0x7f) << 24) | (h[o + 1] << 16) | (h[o + 2] << 8) | h[o + 3];
  return String(code % 1000000).padStart(6, "0");
}

/**
 * Signs in once (password, then TOTP) and returns { session, csrf } for every VU to share.
 * TOTP codes cannot be reused (replay protection), so if the current 30-second code was already
 * used by a previous run, wait for the next one and try again.
 */
export function staffLogin() {
  if (!STAFF_READY) return null;
  if (STAFF.session) return { session: STAFF.session, csrf: STAFF.csrf };
  const jar = http.cookieJar();
  jar.clear(BASE_URL);
  const login = postJson("/api/auth/login", { email: STAFF.email, password: STAFF.password }, { tags: { name: "POST /api/auth/login" } });
  if (login.status !== 200) fail(`staff login failed: HTTP ${login.status} ${login.body}`);
  const csrf = login.json("csrfToken");
  for (let attempt = 0; attempt < 2; attempt++) {
    const mfa = postJson("/api/auth/mfa", { code: totp(STAFF.totpSecret) }, { tags: { name: "POST /api/auth/mfa" }, headers: { "x-csrf-token": csrf } });
    if (mfa.status === 200) {
      const cookie = (mfa.cookies[STAFF_COOKIE] || [])[0] || (login.cookies[STAFF_COOKIE] || [])[0];
      if (!cookie) fail(`no ${STAFF_COOKIE} cookie after sign-in (set STAFF_COOKIE=__Host-ds_session for production builds)`);
      jar.clear(BASE_URL);
      return { session: cookie.value, csrf };
    }
    if (mfa.status === 429) fail(`staff MFA rate-limited (HTTP 429). Wait ~10 minutes. ${mfa.body}`);
    // Probably a reused code: wait for the next 30-second window.
    sleep(31 - ((Date.now() / 1000) % 30));
  }
  fail("staff MFA failed twice — check STAFF_TOTP_SECRET / the credentials file");
}

function staffParams(auth, name) {
  return { tags: { name }, cookies: { [STAFF_COOKIE]: { value: auth.session, replace: true } } };
}

/** Read-only staff traffic: virtual review queue, dashboard counts, patient search. */
export function staffFlow(auth, { search = true, think = [1, 3] } = {}) {
  if (!auth) return;
  group("staff workspace", () => {
    const pause = () => sleep(think[0] + Math.random() * (think[1] - think[0]));
    if (VIRTUAL) {
      // Needs VIRTUAL_SCREENING_ENABLED=true on the server (on in production); -e VIRTUAL=false skips it.
      const q = get("/api/virtual/cases?status=all", staffParams(auth, "GET /api/virtual/cases"));
      check(q, { "review queue 200": (r) => r.status === 200 });
      pause();
    }
    const a = get("/api/analytics", staffParams(auth, "GET /api/analytics"));
    check(a, { "analytics 200": (r) => r.status === 200 });
    if (search) {
      // Patient search is limited to 120 requests per 5 minutes per staff user.
      pause();
      const s = count429(get("/api/patients?limit=25&q=Loadtest", staffParams(auth, "GET /api/patients")));
      check(s, { "patient search 200": (r) => r.status === 200 });
    }
  });
}

// ---------- report ----------

function htmlReport(data, title) {
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
  const fmt = (v) => (typeof v === "number" ? (Number.isInteger(v) ? v : v.toFixed(2)) : v);
  const metricRows = Object.keys(data.metrics).sort().map((name) => {
    const m = data.metrics[name];
    const vals = Object.entries(m.values || {}).map(([k, v]) => `${esc(k)}=${esc(fmt(v))}`).join(" · ");
    const th = m.thresholds ? Object.entries(m.thresholds).map(([k, v]) => `<span class="${v.ok ? "ok" : "bad"}">${esc(k)} ${v.ok ? "✓" : "✗"}</span>`).join(" ") : "";
    return `<tr><td>${esc(name)}</td><td>${vals}</td><td>${th}</td></tr>`;
  }).join("");
  const checks = [];
  const walk = (g) => {
    for (const c of g.checks || []) checks.push(`<tr><td>${esc(g.path || "")}</td><td>${esc(c.name)}</td><td>${c.passes}</td><td class="${c.fails ? "bad" : "ok"}">${c.fails}</td></tr>`);
    for (const sub of g.groups || []) walk(sub);
  };
  if (data.root_group) walk(data.root_group);
  return `<!doctype html><html><head><meta charset="utf-8"><title>${esc(title)}</title>
<style>body{font:14px system-ui,sans-serif;margin:24px;color:#222}table{border-collapse:collapse;width:100%;margin:12px 0}
td,th{border:1px solid #ddd;padding:6px;text-align:left;vertical-align:top}th{background:#f4f4f4}.ok{color:#11733b}.bad{color:#b3261e;font-weight:600}</style></head>
<body><h1>${esc(title)}</h1><p>Target: ${esc(BASE_URL)} · generated ${esc(new Date().toISOString())}</p>
<h2>Checks</h2><table><tr><th>Group</th><th>Check</th><th>Passes</th><th>Fails</th></tr>${checks.join("")}</table>
<h2>Metrics &amp; thresholds</h2><table><tr><th>Metric</th><th>Values</th><th>Thresholds</th></tr>${metricRows}</table></body></html>`;
}

/** Console summary + JSON + HTML files in tests/load/reports/ (gitignored). */
export function makeSummary(name) {
  return (data) => {
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    return {
      stdout: textSummary(data, { indent: " ", enableColors: true }),
      [`${REPORT_DIR}/${name}-latest.json`]: JSON.stringify(data, null, 2),
      [`${REPORT_DIR}/${name}-latest.html`]: htmlReport(data, `TAOC k6 ${name} test`),
      [`${REPORT_DIR}/${name}-${stamp}.json`]: JSON.stringify(data),
    };
  };
}
