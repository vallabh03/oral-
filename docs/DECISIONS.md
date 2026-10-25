# Decision log

| ID | Decision | Status | Notes |
|---|---|---|---|
| ADR-01 | AWS target: Amplify + Lambda + RDS PostgreSQL + private S3 + Cognito, ap-south-2 | Superseded by ADR-18 (hosting only) | Code is cloud-neutral behind `DATABASE_URL` / `STORAGE_DRIVER`; sizing, Multi-AZ and budget need technical-owner approval |
| ADR-02 | Staff sign-in: Cognito/Google (OIDC adapter) **and** email + Argon2id + mandatory TOTP MFA, switchable by config | Accepted by product owner (2026-10-24) | Google identity alone never grants a role; staff are pre-provisioned |
| ADR-03 | Participant self-retrieval | Partially implemented | 7-day resume link in URL fragment → 2-h intake session; OTP verification still to be approved |
| ADR-04 | Camp check-in role | Pending | Check-in currently requires Admin (Doctor) |
| ADR-05 | Lesion present/absent/uncertain rule | Pending clinical owner | Explicit clinician field + consistency validation; "uncertain" blocks classification |
| ADR-06 | Consent text, retention, deletion | Pending privacy/legal | Draft texts versioned in `lib/shared/constants.ts` |
| ADR-07 | WhatsApp production readiness | Pending | Gate + idempotency + signed webhook implemented; provider call disabled |
| ADR-08 | RPO/RTO and backups | Pending operations owner | See DEPLOYMENT.md |
| ADR-09 | Analytics | Accepted | First-party, consent-gated, allowlisted events only; no third-party tags |
| ADR-10 | Concurrency target | Tested at 50 sessions | See `load-results/report.md` |
| ADR-11 | **Participant identity photo** | Accepted by product owner (2026-10-24), deviates from PRD §2.4/§6.2 defaults | Face photo only, separate opt-in consent, private encrypted storage, staff-only access, deleted on withdrawal. Requires privacy-owner sign-off before live use |
| ADR-12 | Brand name "Telangana Against Oral Cancer"; participant ID prefix `HAOC-DS` | Accepted (name) / to confirm (prefix) | Prefix configurable via `PARTICIPANT_ID_PREFIX` |
| ADR-13 | Strict nonce CSP ⇒ all pages rendered per request | Accepted | Trade-off: no static HTML caching; OG images/robots/sitemap stay static |
| ADR-14 | 23 languages = English + 22 scheduled languages; English fallback | To confirm with programme | Translations require clinical review before use |
| ADR-15 | **Oral lesion image capture** (PRD v1.2) implemented behind `CLINICAL_IMAGES_ENABLED=false` | Built; **disabled for live data** | Needs programme, clinical, privacy and security approval of the photography protocol, consent wording, access scope and retention before enabling. The PRD v1.2 document was not available; requirements come from the product owner's change request (2026-10-25) |
| ADR-16 | Lesion image retention / withdrawal / deletion policy | **Pending privacy and clinical owners** | Current behaviour: on consent withdrawal, images are hidden from all viewing (bytes kept pending policy); Doctor Admin can delete images on draft exams with a reason; images on verified exams are immutable |
| ADR-17 | Lesion images stored losslessly (no re-encoding) | Accepted (engineering) | Metadata removed at byte level to keep clinical pixel content intact; only the gallery preview is a re-encoded derivative |
| ADR-18 | Hosting: ECS Fargate behind an Application Load Balancer (+ AWS WAF), RDS PostgreSQL 17 in isolated subnets, private S3 + KMS, Secrets Manager, ap-south-2; infrastructure as code with AWS CDK (`infra/`); GitHub Actions deploys via OIDC | Proposed (engineering, 2026-10-25) — needs technical-owner approval of sizing and budget | Replaces Amplify Hosting because its SSR compute cannot run inside a VPC, so it could only reach a publicly reachable database; health data needs a private one. Containers also suit the native modules (sharp, Argon2) and the in-process photo queue. Migrations run as an init container (schema owner); the app connects as a DML-only role. No NAT gateway (cost): tasks get a public IP for egress but accept traffic only from the load balancer |
