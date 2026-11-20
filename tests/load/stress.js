// Stress / spike test: pushes well past normal traffic to find where the app starts to slow down
// or fail, and checks that it recovers afterwards. NEVER run this against the live site
// (it is refused by config.js) — use a local server or a staging copy.
//
//   npm run test:load:stress                      # stepped stress, peak = 4 × VUS (default 80)
//   k6 run -e PROFILE=spike tests/load/stress.js  # sudden spike to 8 × VUS, then recovery
//   k6 run -e PROFILE=capacity -e STEP=25 -e MAX=300 tests/load/stress.js   # step up to find the limit
import { sleep } from "k6";
import { env, num, guardTarget, BASE_URL, WRITES } from "./config.js";
import { healthCheck, browsePublic, participantFlow, makeSummary } from "./lib.js";

guardTarget("stress");

const VUS = num("VUS", 20);
const PROFILE = env("PROFILE", "stress");

const PROFILES = {
  // Step up: normal → 2× → 4×, then back down to see recovery.
  stress: [
    { duration: "1m", target: VUS },
    { duration: "2m", target: VUS },
    { duration: "1m", target: VUS * 2 },
    { duration: "2m", target: VUS * 2 },
    { duration: "1m", target: VUS * 4 },
    { duration: "2m", target: VUS * 4 },
    { duration: "1m", target: 0 },
  ],
  // A camp announcement goes out on WhatsApp: everyone opens the link at once.
  spike: [
    { duration: "30s", target: VUS },
    { duration: "20s", target: VUS * 8 },
    { duration: "1m", target: VUS * 8 },
    { duration: "20s", target: VUS },
    { duration: "1m", target: VUS },
    { duration: "20s", target: 0 },
  ],
  // Find the limit: add STEP users every 90 s up to MAX (defaults 25 → 300). Compare each step's
  // response times in the CSV/JSON output (k6 run --out csv=...) to see where it degrades.
  capacity: (() => {
    const step = num("STEP", 25);
    const max = num("MAX", 300);
    const s = [];
    for (let v = step; v <= max; v += step) s.push({ duration: "30s", target: v }, { duration: "60s", target: v });
    return s.concat({ duration: "30s", target: 0 });
  })(),
};

export const options = {
  scenarios: {
    mixed: { executor: "ramping-vus", exec: "mixed", startVUs: 0, stages: PROFILES[PROFILE] || PROFILES.stress, gracefulRampDown: "15s" },
  },
  // Looser limits: the point is to find the breaking point, not to pass. Not aborted on failure
  // so the report shows the whole curve.
  thresholds: {
    http_req_failed: [`rate<${num("MAX_FAIL_RATE", 0.05)}`],
    http_req_duration: [`p(95)<${num("P95_MS", 2000)}`],
    checks: ["rate>0.95"],
  },
};

export function setup() {
  console.log(`stress (${PROFILE}) → ${BASE_URL} · base ${VUS} VUs · writes=${WRITES}`);
  healthCheck();
}

// 70% visitors, 30% registering participants.
export function mixed() {
  if (Math.random() < 0.3) participantFlow([1, 3]);
  else browsePublic(undefined, [1, 3]);
  healthCheck();
  sleep(1);
}

export const handleSummary = makeSummary(`stress-${PROFILE}`);
