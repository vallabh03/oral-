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
