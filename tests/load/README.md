# Load and performance tests (Grafana k6)

These scripts send many fake visitors to the website at once and measure how fast it answers.
They use **synthetic data only** (participants named `Loadtest …`, no phone numbers, no contact consent).

> ⚠️ **Never run the load, stress or soak tests against the live site
> (https://telanganaagainstoralcancer.com).** It is a single 4 GB Lightsail server holding real
> participant data. `config.js` refuses to do so. The smoke test may be pointed at the live site,
> but then it only reads public pages and `/api/health` — no registrations, no staff sign-in.
> Run heavy tests against your own computer or a staging copy.

## Install k6

```bash
winget install GrafanaLabs.k6
```

(or `choco install k6`; on macOS `brew install k6`). Check with `k6 version`.

## The tests

| npm script | File | What it does | Default size |
|---|---|---|---|
| `npm run test:load:smoke` | `smoke.js` | Every covered endpoint, a trickle of traffic. Quick “is it working?” check; also run in CI. | 2 users, 30 s |
| `npm run test:load` | `load.js` | A realistic camp day: visitors browsing, participants registering + questionnaire, 2 staff on the review queue/dashboard. | ramps to 20 users, ~5 min |
| `npm run test:load:stress` | `stress.js` | Steps up to 4× normal traffic to find the breaking point, then checks recovery. `-e PROFILE=spike` simulates a sudden 8× spike (e.g. a WhatsApp camp announcement). | peak 80 users, ~10 min |
| `npm run test:load:soak` | `soak.js` | Steady moderate traffic for a long time to catch slow leaks (memory, DB connections). | 10 users, 1 hour |

Each run prints a summary and writes `tests/load/reports/<test>-latest.html` (open in a browser),
`<test>-latest.json` and a timestamped JSON copy. The `reports/` folder is gitignored.

### Endpoints covered

- `GET /api/health`
- Public pages: `/`, `/virtual-screening`, `/camps`, `/faq`, `/register`
- Participant: `POST /api/intake/register` → `POST /api/intake/questionnaire` (draft, then complete) → `GET /api/intake/me` (uses the session cookie that register returns)
- Staff (signed in once in `setup()`, session shared by all virtual users): `GET /api/virtual/cases`, `GET /api/analytics`, `GET /api/patients` (search)
- Sign-in itself: `POST /api/auth/login` + `POST /api/auth/mfa` (once per run)

Photo upload is not covered here; `npm run load:photos` (scripts/load-test-photos.ts) already load-tests it.

## Run against your own computer

```bash
npm run build
```

```bash
npm run seed:dev
```

```bash
npm run test:load:server
```

Then, in a second terminal:

```bash
npm run test:load:smoke
```

`seed:dev` creates synthetic staff accounts and writes their password + TOTP secret to
`.dev-credentials.json` (gitignored). The tests read it automatically and sign in as
`doctor@example.test`. `test:load:server` (`start-server.mjs`) runs `next start` on port 3000 with
`APP_ENV=development` (plain-http cookies, participant intake open, virtual screening on, messages
printed to the console instead of sent). Plain `npx next start` would run in production mode and
the tests could not sign in or register. `npm run dev` also works but is much slower (pages
compile on first visit). If virtual screening is off on your server, add `-e VIRTUAL=false`.

## Run against a staging copy

```bash
k6 run -e BASE_URL=https://staging.example.org -e STAFF_EMAIL=you@example.org -e STAFF_PASSWORD=... -e STAFF_TOTP_SECRET=... tests/load/smoke.js
```

Use a **synthetic staff account created only for testing**. Instead of the password + TOTP secret
you can sign in in a browser and pass the session: copy the `__Host-ds_session` cookie value and the
CSRF token and run with `-e STAFF_SESSION=<cookie> -e STAFF_CSRF=<token> -e STAFF_COOKIE=__Host-ds_session`.
Production builds name the cookies `__Host-ds_session` / `__Host-ds_intake`; set `STAFF_COOKIE`
accordingly. `-e STAFF=false` skips staff traffic and `-e WRITES=false` skips registrations.

## Settings (all optional, pass with `-e NAME=value`)

| Variable | Default | Meaning |
|---|---|---|
| `BASE_URL` | `http://localhost:3000` | Site to test |
| `VUS` | per test (2 / 20 / 20 / 10) | Number of virtual users (stress multiplies this) |
| `DURATION` | `30s` smoke, `1h` soak | Test length |
| `RAMP`, `HOLD` | `1m`, `3m` | load.js ramp-up/down and steady time |
| `PROFILE` | `stress` | stress.js: `stress` or `spike` |
| `P95_MS`, `WRITE_P95_MS`, `MAX_FAIL_RATE` | 1000 smoke / 500 load+soak / 2000 stress; 800; 0.01 (stress 0.05) | Pass/fail thresholds |
| `STAFF_EMAIL`, `STAFF_PASSWORD`, `STAFF_TOTP_SECRET` | from credentials file | Staff sign-in |
| `STAFF_SESSION` (alias `AUTH_TOKEN`), `STAFF_CSRF`, `STAFF_COOKIE` | — | Pre-made staff session instead |
| `CREDENTIALS_FILE` | `.dev-credentials.json`, then `.e2e-credentials.json` | Path relative to this folder |
| `STAFF`, `WRITES`, `SPOOF_IPS`, `VIRTUAL` | `true` | Turn staff traffic / writes / fake IPs / the virtual review queue off |
| `REPORT_DIR` | `tests/load/reports` | Where reports go (relative to where k6 is started) |

## Rate limits and security checks the tests meet

The app protects itself, and the tests are built around that:

- **Origin/CSRF check** (`src/lib/server/http.ts`): every POST sends an `Origin` header equal to
  `BASE_URL`, and staff requests send the `x-csrf-token` from sign-in. If the server's
  `NEXT_PUBLIC_SITE_URL` differs from `BASE_URL` in production mode, POSTs get `403 bad_origin`.
- **Rate limits** (`src/lib/server/security/rateLimit.ts`, stored in the database):

  | Limit | Allowance | Hit by |
  |---|---|---|
  | `register` | 20 per IP per hour | load/stress/soak on staging (all traffic comes from your one IP). Locally each virtual user sends a fake `X-Forwarded-For` address, so it is spread out. On non-local targets a 429 here is counted in `rate_limited_429` and not as a failure. |
  | `intake-write` | 120 per participant per 15 min | never (each participant saves 2 times) |
  | `login` / `login-acct` | 10 per IP / 5 per account per 15 min | running any test more than 5 times in 15 minutes with the same staff account → setup fails with 429. Wait, or use `STAFF_SESSION`. |
  | `mfa` | 8 per 10 min | same as above |
  | `search` | 120 per staff user per 5 min | load.js keeps 2 staff well below it; soak.js does not search |

  TOTP codes also cannot be reused: if two runs start within the same 30 seconds, `setup()` waits
  for the next code automatically.

  For pure capacity measurements on your own computer you can switch the limits off by setting
  `DISABLE_RATE_LIMITS=1` before `npm run test:load:server` (it then uses `APP_ENV=test`; this
  never works in production).
- **Fake IPs** are only sent to `localhost`. Behind Caddy/CloudFront the proxy sets the real address,
  so on staging every request counts against your own IP.

## CI

`.github/workflows/load-test.yml` runs the smoke test every Monday and on demand (Actions → “Load
test (k6 smoke)” → Run workflow). It builds the app, creates a throwaway synthetic database
(`npm run e2e:prepare`), starts it inside the GitHub runner and tests `http://localhost:3000`.
It never touches the live site, and it is informational only — a failure does not block merges or
deploys. The HTML/JSON report is attached to the run as the `k6-report` artifact.

## Reading the results

- `http_req_duration p(95)` — 95 % of requests were faster than this. Under 500 ms feels instant.
- `http_req_failed` — share of requests that failed (5xx, unexpected 4xx). Should be ~0 %.
- `checks` — the per-step expectations (e.g. “register 201”).
- `rate_limited_429` — how often the app's own protection said “slow down”.
- `participant_flow_ms` — how long a whole registration + questionnaire took, including think time.

Local numbers come from embedded PGlite (single-threaded) on a laptop, so they are a lower bound;
production uses real PostgreSQL.
