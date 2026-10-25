# Requirement traceability (PRD v1.1 → code → tests)

| Requirement | Implementation | Tests |
|---|---|---|
| FR-PUB-01 Campaign + programme pages | `src/app/(public)/*`, `src/content/site.ts` | e2e `public.spec` (all pages) |
| FR-PUB-02 Mobile menu, sticky header | `MobileNav.tsx`, `.site-header` | e2e `responsive.spec` |
| FR-PUB-03 Skip link, keyboard | root layout, focus styles | e2e skip-link, axe |
| FR-PUB-04 Dark mode | `ThemeToggle.tsx`, tokens | e2e dark mode, axe dark |
| FR-PUB-05 Site search (public only) | `content/search.ts`, `/search` | unit seo, e2e search |
| FR-PUB-06 FAQ accordion + internal links | `/faq` (`<details>`), `RelatedLinks` | e2e FAQ, unit related links |
| FR-PUB-07 Floating contact | `FloatingContact` | axe |
| FR-PUB-08 Back-to-top, scroll progress | `ScrollUi.tsx` | e2e |
| FR-PUB-09 Copy button, print stylesheet | `CopyButton.tsx`, `@media print` | e2e copy, print |
| FR-PUB-10 Custom 404 | `app/not-found.tsx` | e2e 404 |
| FR-PUB-11 Favicon + app icons | `scripts/generate-assets.ts`, `manifest.ts` | e2e icons |
| FR-PUB-12 Skeletons + empty states | `loading.tsx`, `EmptyState`, list skeletons | e2e search empty state |
| FR-PUB-13 Toasts, form states, confirm modals | `Toaster.tsx`, `ConfirmDialog.tsx`, forms | e2e contact, participant, clinician |
| FR-PUB-14 Loading animation + reduced motion | CSS `prefers-reduced-motion` | e2e reduced motion |
| FR-PUB-15 Hover/focus states | CSS | axe |
| FR-PUB-16 Last-updated date | `LastUpdated` from content metadata | e2e SSR |
| FR-PUB-17 Cookie banner + preferences | `CookieConsent.tsx` | e2e banner, no tracking before consent |
| FR-PUB-18 Contact email notifications | `services/public.ts`, `email.ts` (SES) | integration contact |
| FR-PUB-19 Password visibility toggle | `PasswordInput.tsx` | e2e login |
| FR-PAR-01 23 languages, English fallback | `constants.ts LANGUAGES` | e2e participant |
| FR-PAR-02/03 Registration + separate consents (+ photo consent, ADR-11) | `RegistrationForm.tsx`, `participants.ts` | integration workflow, unit schemas |
| FR-PAR-04 Unique programme ID | `participant_seq` → `HAOC-DS-0001` | integration |
| FR-PAR-05 Protected intake token | hashed, expiring, fragment-delivered | integration resume, security rate limits |
| FR-PAR-06/07 Questionnaire, stable codes, snapshots | `protocol.ts`, `questionnaire.ts` | unit protocol, integration |
| FR-PAR-08 Save/resume, duplicates | partial saves, idempotency, dup check | integration |
| FR-PAR-09 Workflow status | `advanceStatus`, `STATUS_LABELS` | integration |
| **Photo capture & retrieval (user request)** | `CameraCapture.tsx`, `images.ts`, `services/photos.ts`, `/api/photos/[id]`, signed thumbnails | integration photos, security IDOR/signed URLs, e2e camera flows, load test |
| FR-CLI-01..06 Exam, impressions, gate, immutability, 4 groups, disclaimers | `clinical.ts`, `classification.ts`, DB trigger | unit truth table, integration workflow |
| FR-CLI-07/08 Follow-up, corrections | `recordFollowUp`, versioned exams | integration |
| FR-OPS-01/02 Search by ID/QR | `records.ts`, `QrScanner.tsx`, `/api/intake/qr` | integration, security |
| FR-OPS-03 Protected report | `reports`, `/workspace/reports/[id]` | integration, e2e |
| FR-OPS-04..06 WhatsApp gate, truthful status, webhook | `submitWhatsAppReport`, webhook route | security, unit signature |
| FR-OPS-07 Contact email delivery | SES adapter | integration |
| FR-ADM-01..07 Dashboards, timeline, Super Admin, Assistant, audit viewer, exports, errors | `workspace/(app)/*`, `admin.ts` | integration auth-admin, e2e roles |
| FR-SEO-01..13 Metadata, canonical, sitemap, robots, OG, schema, breadcrumbs, links, SSR, images, fonts, GEO, audit gate | `seo.ts`, `sitemap.ts`, `robots.ts`, `og/[slug]`, `next/font`, `next/image`, `scripts/seo-audit.ts` | unit seo, e2e public, `npm run audit:seo` |
| §10.2 Conversion events + UTM | `analytics.ts`, `/api/events` | unit, integration, e2e |
| §8 Security controls | see `SECURITY_AUDIT.md` | `tests/security` |
| §11 Performance / scale | keyset pagination, bounded photo processing | `npm run load:photos` |
| §12 SDLC / §13 agents | CI workflow, `.claude/agents/*` | CI |

## PRD v1.2: oral lesion image capture (acceptance criteria → code → tests)

| Acceptance criterion | Implementation | Automated test |
|---|---|---|
| Capture option during the clinical exam when a lesion is recorded | `LesionImagesPanel.tsx` | e2e `lesion-images.spec` |
| Separate, explicit photography consent before capture; version, language, timestamp, actor, status recorded | `clinical_photo` / `clinical_photo_face` consents, migration 002, `recordClinicalPhotoConsent` | integration "consent granted...", "requires separate face consent" |
| Preview, retake, remove-before-save, progress, camera-permission handling, success/error states | `CameraCapture.tsx` (clinical variant), `LesionImagesPanel.tsx` | e2e capture flow |
| Image linked to participant, exam, lesion site, clinician, timestamp | `lesion_images` table | integration row assertions |
| Declining never blocks the exam; capture never mandatory | Workflow gates ignore images | integration "consent declined...", "does not require photography consent" |
| Face only if clinically necessary and separately consented | `includes_face` + face-consent check | integration "requires separate face consent" |
| Separate private S3 bucket, KMS, Block Public Access, random keys | `storage.ts` clinical store, `DEPLOYMENT.md` | integration key format, config guard |
| Server validates format, real content, size, limits | `clinicalImage.ts`, `upload.ts` | unit `clinical-image.test`, integration "invalid, malformed or oversized" |
| GPS/device metadata removed without altering clinical content | Lossless byte-level stripping | unit pixel equality, integration served bytes |
| Short-lived authorised links only; no public, CDN or bearer URLs | `issueLesionLink` (app links in all environments), `serveLesionContent` | integration "rejects expired and tampered links" |
| Consent withdrawal (photo or face) stops access; re-grant does not revive | `VISIBLE` predicate | security "withdrawing face consent...", "re-grant does not revive..." |
| No race between capture and verification or withdrawal | In-transaction re-check under row lock | security "exam verified mid-upload...", "same idempotency key..." |
| Doctor Admin only; Super Admin, Assistant and participants denied; backend object-level checks | `authz.ts`, service checks | integration "denies Assistant, Super Admin...", "cross-patient..."; e2e Super Admin |
| Capture, view, download, replace, delete audited without image data or URLs | `audit()` in service | integration audit assertions |
| Storage/upload failures handled safely | Cleanup + 503 | integration "handles storage failures safely" |
| Not in PDFs, WhatsApp, analytics or social metadata; no AI diagnosis | Report and WhatsApp paths unchanged; no AI code | code review |
| Disabled for live data until approvals | `CLINICAL_IMAGES_ENABLED` default false | integration "stays disabled unless explicitly enabled" |
