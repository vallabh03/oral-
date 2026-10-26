# Security audit — Vibe-Coded Application Checklist evidence

Application: TAOC DRIVE SAFE platform · Version 1.0.0 (pre-production) · Environment: local/staging-like
Audit date: 2026-10-25 · Performed by: AI-assisted review (author + independent reviewer agent) + automated tests.
**This is evidence for a human reviewer, not a sign-off.** PRD §12.4 requires a named independent reviewer.

## Independent review findings and resolution

| ID | Severity | Finding | Status | Fix / evidence |
|---|---|---|---|---|
| M1 | Medium | Rate limits keyed on the client-controlled first `X-Forwarded-For` entry | **Fixed** | `http.ts clientIp` uses the right-most `TRUSTED_PROXY_HOPS` entry; test "spoofed X-Forwarded-For prefixes cannot dodge IP rate limits" |
| M2 | Medium | Verify/report/follow-up/WhatsApp did not re-check withdrawal + screening consent; registration withdrawal left optional consents granted | **Fixed** | `assertActiveConsented()` on every clinical step; withdrawal cascades to all consents + deletes photo; test "withdrawing registration … blocks further clinical steps" |
| M3 | Medium | WhatsApp could send a superseded report | **Fixed** | Only the latest report built on the latest examination passes the gate |
| M4 | Medium | OIDC accepted tokens without `email_verified` and linked password accounts by email | **Fixed** | `email_verified === true` required; email linking only for password-less (OIDC-provisioned) accounts; OIDC tests |
| M5 | Medium | Registration replay minted a new intake token/session | **Fixed** | Replays return the display ID only; workflow test asserts no token/cookie |
| L1 | Low | Lockout could be extended indefinitely by an attacker | **Fixed** | Active locks are not extended; counter restarts after expiry |
| L2 | Low | TOTP replay race | **Fixed** | Compare-and-set on `mfa_last_step` |
| L3 | Low | WhatsApp idempotency key not bound to patient/report | **Fixed** | Mismatch → 409 |
| L4 | Low | Photos cached for an hour in shared-device browser cache | **Fixed** | `private, no-cache` + ETag (re-authorised 304s) |
| L5 | Low | Duplicate hint disclosed IDs outside a scoped admin's camps | **Fixed** | Hint only within camp scope |
| L6 | Low | Intake "logout" did not revoke the server session | **Fixed** | DELETE revokes the `intake_sessions` row |
| L7 | Low | Audit chain cannot detect truncation of the newest rows; app role may own the table | **Open (ops)** | Run app as non-owner INSERT-only role on `audit_events`; anchor head HMAC to CloudWatch/WORM S3 daily |
| I1 | Info | One HMAC secret for several purposes | Open | Derive per-purpose keys (HKDF) before production |
| I2 | Info | Dev `APP_ENV` in a production build disabled safeguards | **Fixed** | Refuses to start with a real `DATABASE_URL` |
| I3 | Info | Same clinician can record and verify | Open — clinical decision | Add two-person rule if the protocol requires it |
| I4 | Info | Super Admin receives new users' setup links | Open | Email setup links via SES instead of displaying them |
| I5 | Info | CSP blocked S3 presigned image redirects | **Fixed** | `img-src` includes the bucket host when `S3_BUCKET` is set |
| — | Medium (found by tests) | Camera "Take photo" before first frame silently did nothing | **Fixed** | Button disabled until frames arrive |
| — | Medium (found by load test) | Per-thumbnail DB lookups limited photo-list scalability | **Fixed** | Session-bound signed thumbnail URLs; S3 presigned in production |

Counts after remediation: Critical 0 · High 0 · Medium 0 open · Low 1 open (ops) · Info 3 open.

## PRD v1.2 clinical lesion images: security controls

- **Access:** Doctor Admin only (`clinical_image.*`); Super Admin, Assistant and participants denied. Camp-scope object checks on every request; missing and forbidden images look identical (404).
- **Links:** 5-minute links bound to image, variant, expiry and session. Content requests re-check live session, role, scope and consent, and are served `no-store`. Expired or tampered links return 403 (`link_expired` / `invalid_link`).
- **Upload:** 15 MB streaming cap, content-vs-type check, full decode, lossless EXIF/GPS removal, random keys, no overwrite, separate private KMS bucket, cleanup on storage failure.
- **Consent:** separate consent plus separate face consent; withdrawal hides images immediately.
- **Audit:** capture, replace, view, download, delete and denials, without URLs or bytes.
- **Tests:** `tests/integration/lesion-images.test.ts` (14), `tests/security/lesion-hardening.test.ts` (8), `tests/unit/clinical-image.test.ts` (4), `tests/e2e/lesion-images.spec.ts` (3).
- **Independent review (2026-10-25)**, 1 High and 5 Medium, all **fixed** with regression tests in `tests/security/lesion-hardening.test.ts`:
  - **High:** JPEG metadata between scans or after EOI (e.g. secondary images with GPS) survived. Now a full segment parse plus allow-list (a mutation check confirmed the test catches the old behaviour).
  - **Medium:**
    - S3 presigned bearer URLs bypassed live checks. Now all bytes are app-served behind session-bound links.
    - Workflow/consent checks ran outside the write transaction. Now re-checked under a row lock; delete is guarded the same way.
    - Withdrawing face consent didn't hide face images. Fixed.
    - A doctor's re-grant revived hidden images. Visibility is now tied to each image's own consent.
    - Decode memory DoS. Fixed with a 40 MP cap, preview-based decode and a dedicated 2-slot gate.
  - **Low:**
    - PNG/WebP used deny-lists. Now allow-lists, and JFXX is dropped.
    - Production KMS/S3 was not enforced. Config now refuses to start without them.
    - Idempotency race returned a 500. It now replays the first upload.
    - The feature flag was checked after reading the body. It is now checked first.
    - The signing key was shared. It is now a dedicated derived key.
  - **Info:**
    - Consent language is now accepted from the clinician.
    - The lesion site must be one recorded in the exam.
    - JPEG fill bytes are handled.
- **Open:** the ADR-16 retention policy, and a human security sign-off before the feature is enabled for live data.

## Checklist coverage (evidence)

1. **Authentication** — Argon2id (`security/password.ts`); per-IP + per-account limits and lockout; identical errors for unknown/wrong (test); 256-bit opaque tokens stored as keyed hashes, idle 30 min / absolute 12 h; logout and reset revoke sessions; reset tokens random, single-use, 30 min, non-enumerating (tests); TOTP MFA mandatory for every staff role; cookies HttpOnly + SameSite=Strict + Secure/`__Host-` in prod; OIDC with PKCE/state/nonce/issuer/audience; fixed redirect URI.
2. **Authorization** — every route via `handler()` with server-side permission (`authz.ts`); object scope via `loadPatientForStaff` (404 for missing or forbidden); role × endpoint matrix and IDOR tests; no self-promotion/last-super-admin rule; deactivation revokes sessions immediately (tests).
3. **API** — strict zod schemas (unknown fields rejected), body caps (413), JSON-only (415), safe errors with correlation IDs, no CORS headers (same-origin only), methods limited to exported handlers.
4. **Input validation / 8. XSS** — names restricted to letters; React escaping; only `dangerouslySetInnerHTML` uses are escaped JSON-LD and server-generated QR SVG; nonce CSP with `strict-dynamic`.
5. **SQL** — parameterised queries only; dynamic WHERE builders bind values; SQLi payload tests.
6. **Secrets** — env only, `.env*` git-ignored, prod config fails closed, secret scan (tree + history) clean; seed credentials written only to git-ignored files.
7. **Frontend** — no tokens in localStorage (only theme/privacy-screen flags); CSRF token in meta tag; source maps off; admin UI server-guarded.
9. **CSRF** — Origin/Sec-Fetch-Site check + per-session CSRF header on staff mutations (tests).
10. **Uploads** — streamed size cap, magic bytes, pixel limit, re-encode (EXIF/GPS stripped), random keys, no overwrite, private storage, consent-gated, deleted on withdrawal (tests).
11. **SSRF** — no user-supplied URLs are fetched; outbound only to configured OIDC/SES/S3 with timeouts.
12. **Payments** — not applicable (no payments).
13/14. **AI/agents** — no AI in the product; SDLC agents in `.claude/agents/` are least-privilege, synthetic-data-only, cannot sign off (PRD §13.1).
15/16. **Dependencies/repo** — pinned exact versions, lockfile, `npm audit` 0 vulnerabilities (postcss override), CI runs audit + secret scan; branch protection to be enabled on the remote.
17. **Headers** — CSP, HSTS (preload), nosniff, Referrer-Policy, Permissions-Policy (camera self only), X-Frame-Options DENY, COOP/CORP (tests).
18. **Logging** — HMAC-chained append-only audit of auth failures, denials, record/photo/report access, exports, role changes; PHI keys redacted; Super Admin chain verification.
19. **Errors** — generic messages + correlation ID; details only in server logs/app_errors.
20. **Business logic** — server-side state machine; verification gate; immutable verified exams (DB trigger); idempotency on registration, questionnaire, photos, contact, WhatsApp.
21. **Admin** — Super Admin routes server-guarded; MFA for all; role changes audited and revoke sessions.
22. **Deployment** — see `DEPLOYMENT.md`; intake and indexing disabled by default in production.
23. **Rate limiting** — login, MFA, reset, register, token exchange, intake writes, uploads, search, contact, events, export, reports, WhatsApp.
24. **Privacy** — minimal fields, separate opt-in consents incl. photo, withdrawal flows, de-identified exports, analytics allowlist + consent gate.
27. **Adversarial matrix** — `tests/security/adversarial.test.ts` (anonymous, participant, other participant, assistant, admin, scoped admin, super admin, deactivated, forged cookies, cross-site).

## Security sign-off (to be completed by a named human reviewer)

Application: ________ Version: ________ Environment: ________ Audit date: ________ Audited by: ________
Critical: ___ High: ___ Medium: ___ Low: ___ Critical/High resolved: YES / NO
Production security review: PASS / FAIL · Final approval: ________ Date: ________

## Virtual screening (patient-captured images): security controls

- **Access:** images and findings are Doctor-only (`virtual.review`); Super Admin, Assistant and
  participants get 403/401. Participants see only their own previews. Every image request
  re-checks the doctor's session and role; responses are `no-store`; no public or CDN URL exists.
- **Uploads:** untrusted bytes land in a quarantine key (presigned S3 PUT, 10 min, quarantine prefix
  only) and become an image only after server-side validation and metadata removal; quarantine is
  deleted either way. Tickets are bound to the participant (other participants get 404).
- **State machine:** uploads, removals and submission are allowed only while the case awaits photos;
  re-checked under a row lock at completion. Decisions only while a case is under review; "no
  suspicious lesion" requires every current photo reviewed acceptable.
- **Consent:** `remote_images` required to upload; withdrawal hides photos from doctors.
  `review_notifications` required for review messages; STOP on WhatsApp withdraws it.
- **Login codes:** 6 digits, HMAC-hashed, 10-minute expiry, single use, 5 attempts (the counter is
  committed even on failure), per-IP and per-participant request limits, identical response whether
  or not the details match. The code is shown on screen only with the console driver outside production.
- **Messages:** template text only (first name, clinic, phone, participant ID); never images, notes
  or diagnoses. Webhook calls are HMAC-verified; status updates are idempotent and monotonic.
- **Feature switch:** `VIRTUAL_SCREENING_ENABLED=false` by default; production requires the
  separate clinical bucket and KMS key.

### Independent review of virtual screening (2026-10-26): findings and resolution

| # | Severity | Finding | Fix | Regression test |
|---|---|---|---|---|
| 1 | High | Presigned S3 PUTs have no size limit; completion read the whole object into memory | HEAD size check before reading; oversize objects deleted (413); quarantine lifecycle rule | `virtual-hardening` 1 |
| 2 | Medium | Login codes guessable over time (attempts reset with each new code) | Max 5 codes and 10 wrong guesses per participant per 24 h | `virtual-hardening` 2 |
| 3 | Medium | Account-existence oracle via rate limit and send timing | Limit keyed on the entered details before lookup; code sent off the request path | `virtual-hardening` 3 |
| 4 | Medium | Replaced or unsent photos reached doctors and were never deleted | Retake deletes the unsent photo; doctor queries and image serving require `submitted` | `virtual-hardening` 4 |
| 5 | Medium | Production could run with the console message driver (messages "sent" nowhere, codes kept in memory) | Production requires `NOTIFY_DRIVER=whatsapp` with virtual screening; console outbox disabled in production | config guard (code review) |
| 6 | Low | Dispatcher could reclaim a stuck login-code row and send an empty code | Login-code rows excluded from dispatch; send errors mark the row failed | `virtual-hardening` 6 |
| 7 | Low | Review/decision possible after photo consent withdrawal | Image review blocked; only "inconclusive → in-person" allowed | `virtual-hardening` 7 |
| 8 | Low | 21st photo round produced a 500 | Clear 409 asking for an in-person examination | `virtual-hardening` 8 |
| 9 | Low | Webhook read an unbounded body before its size check | Streamed read capped at 256 KB before signature verification | `virtual-hardening` 9 |
