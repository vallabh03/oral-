// Load test: a realistic camp-day mix ramping up to VUS (default 20) virtual users.
//   - visitors browsing public pages (most traffic)
//   - participants registering and filling the questionnaire (synthetic data)
//   - two staff members watching the review queue and dashboard
//
//   npm run test:load
//   k6 run -e VUS=40 -e HOLD=10m tests/load/load.js
import { env, num, seconds, guardTarget, BASE_URL, WRITES, STAFF_READY } from "./config.js";
import { healthCheck, browsePublic, participantFlow, staffLogin, staffFlow, makeSummary } from "./lib.js";

guardTarget("load");

const VUS = num("VUS", 20);
const RAMP = env("RAMP", "1m");
const HOLD = env("HOLD", "3m");
const P95 = num("P95_MS", 500);
const total = `${seconds(RAMP) * 2 + seconds(HOLD)}s`;

const stages = (n) => [
  { duration: RAMP, target: n },
  { duration: HOLD, target: n },
  { duration: RAMP, target: 0 },
];

export const options = {
  setupTimeout: "90s",
  scenarios: {
    visitors: { executor: "ramping-vus", exec: "visitor", startVUs: 0, stages: stages(Math.max(1, Math.ceil(VUS * 0.6))), gracefulRampDown: "10s" },
    participants: { executor: "ramping-vus", exec: "participant", startVUs: 0, stages: stages(Math.max(1, Math.floor(VUS * 0.4))), gracefulRampDown: "10s" },
    // 2 staff at ~1 request every 3-8 s keeps patient search under its 120 per 5 minutes limit.
    staff: { executor: "constant-vus", exec: "staff", vus: 2, duration: total, gracefulStop: "10s" },
  },
  thresholds: {
    http_req_failed: [`rate<${num("MAX_FAIL_RATE", 0.01)}`],
    http_req_duration: [`p(95)<${P95}`],
    "http_req_duration{scenario:visitors}": [`p(95)<${P95}`],
    "http_req_duration{scenario:participants}": [`p(95)<${num("WRITE_P95_MS", 800)}`],
    "http_req_duration{scenario:staff}": [`p(95)<${num("WRITE_P95_MS", 800)}`],
    checks: ["rate>0.99"],
  },
};

export function setup() {
  console.log(`load → ${BASE_URL} · up to ${VUS} VUs · writes=${WRITES} · staff=${STAFF_READY}`);
  healthCheck();
  return { auth: staffLogin() };
}

export function visitor() {
  browsePublic(undefined, [2, 6]);
}

export function participant() {
  participantFlow([3, 8]); // people take a few seconds per screen
}

export function staff(data) {
  staffFlow(data.auth, { think: [3, 8] });
}

export const handleSummary = makeSummary("load");
