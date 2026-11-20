// Soak test: steady, moderate traffic for a long time (default 1 hour) to reveal slow leaks —
// memory growth, database connections not returned, response times creeping up.
// NEVER run against the live site (refused by config.js).
//
//   npm run test:load:soak
//   k6 run -e VUS=10 -e DURATION=4h tests/load/soak.js
import { sleep } from "k6";
import { env, num, guardTarget, BASE_URL, WRITES, STAFF_READY } from "./config.js";
import { healthCheck, browsePublic, participantFlow, staffLogin, staffFlow, makeSummary } from "./lib.js";

guardTarget("soak");

const VUS = num("VUS", 10);
const DURATION = env("DURATION", "1h");

export const options = {
  setupTimeout: "90s",
  scenarios: {
    visitors: { executor: "constant-vus", exec: "visitor", vus: Math.max(1, Math.ceil(VUS * 0.6)), duration: DURATION },
    participants: { executor: "constant-vus", exec: "participant", vus: Math.max(1, Math.floor(VUS * 0.4)), duration: DURATION },
    staff: { executor: "constant-vus", exec: "staff", vus: 1, duration: DURATION },
  },
  thresholds: {
    http_req_failed: [`rate<${num("MAX_FAIL_RATE", 0.01)}`],
    http_req_duration: [`p(95)<${num("P95_MS", 500)}`, `p(99)<${num("P99_MS", 1500)}`],
    checks: ["rate>0.99"],
  },
};

export function setup() {
  console.log(`soak → ${BASE_URL} · ${VUS} VUs for ${DURATION} · writes=${WRITES} · staff=${STAFF_READY}`);
  healthCheck();
  return { auth: staffLogin() };
}

export function visitor() {
  browsePublic(undefined, [3, 8]);
}

export function participant() {
  participantFlow([5, 10]);
  sleep(5);
}

export function staff(data) {
  // Patient search left out: a leak test does not need it, and it has its own rate limit.
  staffFlow(data.auth, { search: false, think: [5, 10] });
  sleep(10);
}

export const handleSummary = makeSummary("soak");
