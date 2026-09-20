# DRIVE SAFE evaluation platform

This implementation follows the supplied HAOC / DRIVE SAFE version 1.0 draft. It is a private evaluation release, not authorization to process real patient data.

## Implemented

- Campaign page and single participant-entry route; consent-led registration and supplied short questionnaire.
- Random permanent HAOC-DS identifiers. Aadhaar, home addresses and lesion photographs are not collected.
- Four clinical groups from explicitly entered habit and lesion status, only after completed examination and clinician verification. Participant responses alone do not classify a person.
- Referral, cessation and longitudinal follow-up records, preserving earlier workflow versions.
- Separate testing/treatment consent; verified doctor assessment and testing recommendation before sample collection; assessment, doctor decision and treatment consent before approval.
- Sample lifecycle, private PDF reports, patient/sample confirmation, second-person live verification and verified report linking. Database triggers reject wrong-patient report links.
- Server-side role and assignment checks; patient accounts restricted to one linked participant; no public read/list endpoint for participant submissions.
- Revocable random patient QR tokens stored as hashes; camera QR decoding and manual ID fallback. Programme QR contains only the registration URL.
- Prepared database queries, bounded request bodies, rate limits, origin checks, no-store sensitive responses, private object storage and restrictive response headers.
- Append-only audit and consent history. Live audit entries have HMAC signatures; demo entries are marked DEMO. Infrastructure administrators remain a trusted boundary.
- De-identified analysis projection excluding names, phones, free-text notes, working area and staff identifiers. Longitudinal participant IDs remain pseudonymous, not anonymous.

## Architecture

React + TypeScript + Vinext / Cloudflare Workers; D1 relational storage and R2 private reports, using the Sites hosting runtime. D1 is SQLite-compatible, not PostgreSQL. Authentication is delegated to Sites; no passwords or service secrets are stored in browser code. Demo data is persistent and isolated by authenticated user ID. Clinical-role restrictions are bypassed only inside that user's isolated demo namespace so the whole workflow can be evaluated.

Identity/contact fields and screening records have separate API projections and linked records, but not separate physical databases. No third-party analytics or AI patient-data processing is included.

## Operational gates before real use

The organization must approve its privacy notice, final consent text, retention/deletion/correction procedure, hosting/data-processing arrangements and access roster. Clinical leads must finalize lesion criteria, referral urgency, cessation support and follow-up guidance. No intervals or diagnosis rules are invented here.

The live and public intake flags default off. ADMIN_EMAIL, a securely generated AUDIT_KEY, approved protocol, final PRIVACY_NOTICE and CONSENT_VERSION must be supplied server-side. Public intake additionally needs PUBLIC_INTAKE_ENABLED and an explicitly authorized public audience. Do not simply flip these flags to bypass review.

The private site uses account-based staff authentication. The public entry endpoint returns only camps, approved questionnaire and a one-time, 30-minute submission capability; it never returns prior records or clinical data. Losing this capability requires assistance at the registration desk. Patient account provisioning and contact details still require the programme team.

## Backups, recovery and privacy operations

No unattended backup schedule, restore drill, automated retention deletion, correction/deletion case-management UI, malware scanning service or external immutable audit archive has been provisioned. These require the organization's retention policy, approved backup destination and operational ownership before live use.

An operator should define database and private-object backup frequency, encryption/key custody, restoration objectives, retention and deletion handling; test a coordinated database/object restore in a separate environment; and reconcile report metadata against object IDs. Deletion must preserve required legal/audit history according to an approved policy, rather than disabling append-only safeguards casually. Audit HMAC verification and external checkpointing should be part of the operational review.

## Validation performed

- TypeScript check and deployable Worker build.
- Seven domain tests covering all four groups, clinical verification, conditional questionnaire validation, sensitive-field rejection, consent, role/assignment scope, treatment safeguards and sample transitions.
- Four SQLite integrity tests including report/sample identity, case-insensitive duplicate protection, audit immutability and consent immutability.
- 48 local API assertions covering registration, persistence, duplicate rejection, questionnaire storage, all groups, testing consent, sample transitions, report upload/verification/linking, wrong-patient rejection, anonymous access denial, token revocation, live/public gates, de-identified export and longitudinal updates.
- Dashboard horizontal-overflow checks at 320, 360, 375, 390, 412, 430, 480, 768, 820, 1024, 1280, 1440, 1920 and 2560 CSS pixels; mobile registration through to questionnaire.
- WebMCP navigation: valid section updates visible UI, invalid section rejected.

Physical iPhone Safari, iPhone Chrome, Android camera permissions/scanning, full assistive-technology testing, adversarial penetration testing, all live-role integration paths, load testing and backup restoration remain unverified. Browser width checks are not physical-device certification. Use synthetic data only until those checks and organizational approval are complete.

## Development

Install using the existing lockfile. Start with `node scripts/run-framework.mjs dev`; build with `node scripts/run-framework.mjs build`. Database schema is in `db/schema.ts`; append new Drizzle migrations rather than rewriting deployed ones. Tests: `node --experimental-strip-types --test tests/domain.test.ts`, `python tests/integrity.py`, and `node tests/api.mjs` against the local dev server. The API test uses the starter's localhost-only mock sign-in, which is not present in the production build.


## Staff access levels
New accounts use exactly three types: Doctor – Admin (`DOCTOR_ADMIN`), Tech Support – Super Admin (`SUPER_ADMIN`), and Assistant – Data & Reporting (`ASSISTANT`). Doctors manage all programme patients, clinical care, samples and laboratory reports. Super admins manage accounts, role assignment, programme configuration, camps, operational data and audit access. Clinical approvals remain doctor-only. Assistants can review programme patient records, samples and reports and generate de-identified programme JSON reports, but cannot modify clinical data or accounts.

Migration 0005 upgrades existing ADMIN and DOCTOR accounts. Legacy restricted roles retain their old restrictions and are not automatically promoted; new account creation offers only the three requested types. ADMIN_EMAIL bootstraps a Super Admin. Live access remains gated by the existing governance configuration. Demonstration mode continues to allow the full workflow on synthetic records; it is not a role simulation. Hosting infrastructure, environment secrets and deployment access remain controlled by the hosting owner, not by an application role. Audit and consent records remain append-only even for Super Admins.

The Analysis & reporting view generates timestamped reports with pseudonymous participant records and sample/report status totals. It intentionally excludes names, phone numbers and free-text notes. Dashboard list metrics cover the returned workspace records (maximum 1,000 patients); exports cover the full authorised programme dataset.


## Update — 18 Sep 2026

- Public landing page rebuilt to the campaign brief (white / warm off-white / charcoal / soft grey, one bronze accent; no cartoon imagery). Contact details render only when `CONTACT_EMAIL` / `CONTACT_PHONE` are configured; none are invented.
- Staff workspace re-themed to the same neutral palette.
- Classification: the habit × lesion → group matrix and pathway wording now live in each protocol version (`classification`, defaulting to DRIVE SAFE v1.0). Examinations use the newest approved protocol. Groups are still assigned only after a completed, clinician-verified examination.
- Scoped roles can now be created alongside the three programme-wide roles: Doctor, Counsellor, Lab, Registration and Patient (bound to exactly one existing participant). Doctors and counsellors only see participants assigned to them; the profile has separate doctor and counsellor assignment pickers.
- Read-only Assistants no longer receive free-text clinical or counselling notes, clinical outcomes or unverified reports.
- Patients no longer receive their internal group number or pathway label.
- The oral examination requires recorded screening consent. Verified examinations cannot be edited; a new examination must be recorded to amend one.
- Consent records use `CONSENT_VERSION` (demo records are prefixed `DEMO-`).
- Migration 0006 adds append-only `sample_events` so every sample status change has its own timestamp and actor, shown as a history on each sample.
- Added the X-Frame-Options, `frame-ancestors 'none'`, HSTS and COOP headers.

Known trade-offs: the public intake still returns a generic "ask the registration desk" response on a duplicate name + phone, which confirms that a registration exists. Staff sign-in still depends on the Sites/ChatGPT identity proxy. Replacing it with an institution-controlled identity provider is recommended before live use.


## Role dashboards and application sessions
The three new-account roles now use explicit capabilities in `lib/permissions.ts`. Doctor Admin has clinical/records/reporting access without settings, user management, audit administration, backup, or QR rotation rights. Assistant is read-only and can generate filtered analysis. Super Admin manages application users, sessions, settings, identifiers/QR rotation, sample/report operations, status/error monitoring and authorised logical exports. Clinical sign-off remains doctor-only.

`/workspace` is an authenticated entry page. It starts a secure application session and sends the user to `/workspace/doctor`, `/workspace/assistant` or `/workspace/super-admin`. Those server-rendered routes validate the session and current database role before rendering; manually opening another dashboard redirects to the permitted dashboard. Synthetic evaluation is separately available at `/workspace/demo`, with no access to live system/session information.

Authentication/passwords/MFA remain with the managed identity provider. The app stores only SHA-256 hashes of random application-session tokens. Production cookies use Secure, HttpOnly, SameSite=Strict and the __Host- prefix. The server enforces idle expiry (15 minutes default) and absolute expiry (8 hours default), and checks account activation and role on each request. Role updates revoke that user's sessions. Super Admin can revoke sessions and adjust bounds (5–60 idle minutes, 1–12 absolute hours). Sensitive responses are no-store. Important permission denials, clinical operations, exports and session operations are audited; internal-error monitoring stores only timestamps and error categories.

Set ADMIN_EMAIL to the approved first technical administrator, provide AUDIT_KEY, and enable STAFF_ACCESS_ENABLED for staff onboarding without opening public intake. LIVE_INTAKE_ENABLED remains a separate gate on new participant registration; public intake requires its original additional governance flags. Provisioned staff must also be allowed through the hosting site's access policy. These environment and hosting controls are owner-managed. Account creation requires the authenticated identity-provider user ID, not a password. No invitations are sent automatically.

The doctor can generate a patient-specific JSON or printable HTML report (browser print/save PDF), including questionnaire and clinical history, sample details and laboratory-report metadata. Original laboratory PDFs retain their protected download workflow. Assistants can filter registration cohorts by camp, category and date; see distinct screened/categorized/sampled/reported counts, camp/category summaries and habit totals; export JSON and print the summary. These descriptive statistics do not infer medical diagnoses or causality.

Logical backup exports contain identifiable database records and require Super Admin access; they exclude private R2 PDF objects and authentication/session secrets. They are not a full disaster-recovery backup. External encrypted backup storage, restore drills, provider MFA policy, production penetration testing and physical-device/camera validation remain operational requirements. No production activation or real-account assignment is performed by this code change.

Validation: `node --experimental-strip-types --test tests/domain.test.ts`, `python tests/integrity.py`, existing `node tests/api.mjs`, and `node tests/roles-api.mjs`. The latter stops/starts a localhost preview, temporarily configures local-only access, applies new migrations only to the local test database, exercises live-mode roles with synthetic records and restores local configuration. Stop any existing localhost preview before running it.

Direct API requests default to the secure live-access path. Synthetic demonstration must be explicitly selected and is isolated by authenticated user; it does not expose live sessions, configuration, backups or patient data.

## Language and landing update

The shared language system supports all 23 requested locale choices, native-script selectors, device/account preferences, participant language capture, protected report language selection, local Noto fonts and RTL layout. Canonical patient/answer data and existing access restrictions are unchanged. The landing page adds a configured contact strip, support enquiries, upcoming camps and an expanded footer.

Translation coverage is intentionally transparent: English is complete; Telugu/Hindi have expanded UI copy and other locales have core interface vocabulary. Missing interface strings and all unreviewed clinical/consent translations fall back to English. This is not a claim of complete or medically reviewed translation into all 23 languages. See `TRANSLATIONS.md` for review workflow, coverage, preferences, scripts, fonts and activation limitations.

Validation: `npx --no-install tsx --test tests/i18n.test.ts tests/domain.test.ts`, `node tests/language-api.mjs` against the local preview, `python tests/integrity.py`, `node tests/api.mjs`, TypeScript and the production build. The local language API test uses only synthetic records and restores the prior account preference.
