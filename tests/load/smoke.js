// Smoke test: 2 virtual users for 30 seconds. Proves every covered endpoint works under a trickle
// of traffic. Safe default for CI. Against the live site it runs read-only (pages + health).
//
//   npm run test:load:smoke
//   k6 run -e BASE_URL=https://staging.example.org tests/load/smoke.js
import { sleep } from "k6";
import { env, num, guardTarget, BASE_URL, WRITES, STAFF_READY } from "./config.js";
import { healthCheck, browsePublic, participantFlow, staffLogin, staffFlow, makeSummary } from "./lib.js";

guardTarget("smoke");

export const options = {
  vus: num("VUS", 2),
  duration: env("DURATION", "30s"),
  setupTimeout: "90s",
  thresholds: {
    http_req_failed: [`rate<${num("MAX_FAIL_RATE", 0.01)}`],
    http_req_duration: [`p(95)<${num("P95_MS", 1000)}`],
    checks: ["rate>0.99"],
  },
};

export function setup() {
  console.log(`smoke → ${BASE_URL} · writes=${WRITES} · staff=${STAFF_READY}`);
  healthCheck();
  return { auth: staffLogin() };
}

export default function (data) {
  healthCheck();
  browsePublic(undefined, [0.3, 1]);
  participantFlow([0.3, 1]);
  // One VU also exercises the staff workspace (shared session from setup).
  if (__VU === 1) staffFlow(data.auth, { think: [0.3, 1] });
  sleep(1);
}

export const handleSummary = makeSummary("smoke");
