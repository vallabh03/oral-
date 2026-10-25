# Architecture

## Request path (PRD §7.2)

Browser → Application Load Balancer (TLS, AWS WAF) → ECS Fargate container → `middleware.ts` (nonce CSP, noindex on private routes)
→ route handler wrapped by `lib/server/http.ts`:
origin/CSRF check → session (hashed opaque token, idle 30 min / absolute 12 h, active user) →
MFA gate → permission (`authz.ts`) → rate limit (DB-backed, works across containers) → body size +
strict zod schema → service (object scope via `loadPatientForStaff`) → parameterised SQL in a
transaction → HMAC-chained audit event → safe JSON response with correlation ID.

| Concern | Local / test | Production (AWS, ap-south-2) |
|---|---|---|
| Web + API | `next start` | ECS Fargate (Next.js standalone container, `Dockerfile`), see ADR-18 |
| Database | PGlite (embedded Postgres 17) | RDS PostgreSQL 17, isolated subnets, KMS, PITR, forced TLS; app uses a DML-only role (no RDS Proxy needed: containers keep a connection pool) |
| Photos | `db` (bytea table) or `local` disk | Private S3 bucket, SSE-KMS, Block Public Access, versioning |
| Staff sign-in | Email + Argon2id + TOTP MFA | Same, plus Cognito + Google federation (`OIDC_ENABLED`) |
| Email | console outbox | SES |
| Secrets | `.env.local` (dev values) | Secrets Manager → env; config fails closed if weak/missing |

## Participant identity photos

Requirement: every participant record can carry a face photo captured at registration (self or
camp-assisted), stored with the record and shown when staff retrieve records — under heavy load.

Consent: separate, opt-in `photo` consent (version + text hash + language). No consent → upload
refused (409). Withdrawal supersedes the photo and deletes its bytes; the metadata row remains for
audit. Lesion photography is a separate, separately consented feature: see "Oral lesion images (PRD v1.2)" below.

Capture (client, `CameraCapture.tsx`): `getUserMedia` (front camera, face guide) with file-input
fallback (`capture="user"`); the image is downscaled to ≤720 px and encoded WebP (JPEG fallback)
on the device — typically 40–90 KB instead of 2–5 MB. Upload uses XHR with progress, an
`Idempotency-Key` that is reused across retries, and exponential backoff that honours
`Retry-After` on 503/429.

Ingest (server, `upload.ts` → `images.ts` → `services/photos.ts`):
1. Streamed read with a hard byte cap (3 MB default) — no unbounded buffering.
2. Magic-byte sniffing (JPEG/PNG/WebP only; SVG/GIF/polyglots rejected) and pixel-count limit.
3. Re-encode with sharp inside a bounded semaphore (`PHOTO_PROCESS_CONCURRENCY`, queue limit
   `PHOTO_QUEUE_LIMIT`): auto-orient, strip all EXIF/GPS, 720 px WebP + 160 px thumbnail.
   When the queue is full the API answers 503 + Retry-After (backpressure) instead of degrading.
4. Write both objects under random server-generated keys (`photos/<patient>/<uuid>.webp`), never
   overwriting (`IfNoneMatch: *` on S3, `wx` locally).
5. Transaction: lock patient row, supersede the previous photo, insert `patient_photos`
   (consent id, sizes, sha256, who captured), audit event. On failure the objects are deleted.

Retrieval: record lists (`GET /api/patients`) use keyset pagination on `(created_at, id)` and a
`LATERAL` lookup of the current photo, returning only thumbnail URLs — the list query never moves
image bytes. Browsers lazy-load the 160 px thumbnails (`loading="lazy"`, `decoding="async"`).
Thumbnail URLs in a list are **signed** by the (authorised, audited) list endpoint: an HMAC over
photo id, patient id, a 10-minute-bucketed expiry and the hash of the caller's session cookie. Serving
a signed thumbnail needs no database query — it must still be requested with the same session
cookie, and links expire within 20 minutes. In production the photo endpoint redirects to a
5-minute S3 presigned URL so image bytes never pass through the app tier. Full-size photos always
go through the full session + camp-scope check and are individually audited. Responses carry strong
ETags with `Cache-Control: private, no-cache`, so every view is re-authorised but costs only a 304
when unchanged, and nothing stays viewable from a shared device's cache after logout or withdrawal.
Measured results: `docs/LOAD_TEST.md`.

Indexes: `patient_photos_current (patient_id, created_at desc) where superseded_at is null`,
`patients_recent (created_at desc, id desc)`.

## Data model

See `src/lib/server/db/migrations/001_initial.sql`. Highlights: append-only `consents` (current =
latest per type); versioned questionnaire submissions with question-text snapshots; `exam_records`
immutable once verified (trigger), corrections create new versions; `classifications` only after
verification; `audit_events` append-only (trigger) with HMAC chain verified in the Super Admin UI.

## Clinical workflow guard rails

Server-side state machine (`advanceStatus`): register → questionnaire → check-in → exam (draft) →
verify → classify (4-group engine, `lib/shared/classification.ts`) → report → follow-up.
Uncertain/missing lesion status is never forced into a group (ADR-05 pending).

## Oral lesion images (PRD v1.2)

Clinical documentation of a visible lesion, captured by a Doctor Admin during the examination. It
supports authorised professional review and is **not** a diagnosis: no AI interprets images or
assigns a group from them, and images are excluded from reports, WhatsApp, analytics, social
metadata and exports.

**Feature switch:** `CLINICAL_IMAGES_ENABLED` (default `false`). It stays off for live patient data
until the photography protocol, consent wording, access scope and retention policy are approved.

**Flow:** the participant record shows an "Examination" section, then a "Clinical images of the
lesion" panel.
1. The clinician saves an exam draft with *Lesion present = yes/uncertain*.
2. The clinician records separate consent (`clinical_photo`, plus `clinical_photo_face` only if the
   face is clinically necessary) as **granted** or **declined**, with policy version, text hash,
   language, actor and time.
3. If granted, the clinician captures with the rear camera at full resolution, or uploads an existing
   image, then previews, retakes or discards it, and saves.
4. If declined, the exam continues; verification, classification and reporting are unaffected.

**Server pipeline** (`services/lesionImages.ts`, `clinicalImage.ts`):
1. Permission check.
2. Camp-scope check.
3. Workflow check (latest exam, still a draft, with a lesion recorded).
4. Consent checks.
5. Idempotency.
6. Streaming size cap (`CLINICAL_IMAGE_MAX_BYTES`, default 15 MB).
7. Magic-byte type check.
8. **Lossless metadata removal by allow-list.** JPEG: every segment is parsed, including those between
   progressive scans; only decoding segments plus JFIF, ICC and Adobe are kept, and anything after
   EOI (MPF secondary images, gain maps, vendor trailers) is dropped. PNG and WebP keep only image and
   colour chunks. Pixels are not re-encoded; JPEG orientation is kept via a minimal Orientation-only
   EXIF block.
9. Full decode while building the preview, to reject corrupt or truncated files (40 MP cap, a
   dedicated 2-slot processing gate).
10. A 480 px WebP preview.
11. Random keys `lesions/<patient>/<uuid>.<ext>` in the clinical store.
12. One transaction that locks the patient row, **re-checks** workflow, consent and replacement (closing races with verification or withdrawal), and inserts the metadata row plus audit event. Concurrent retries with the same idempotency key resolve to a single image.

On storage failure, partial objects are removed and the API returns 503 `storage_unavailable`;
nothing is half-saved.

**Storage:** `objectStore("clinical")`. In production this is a dedicated private S3 bucket
(`CLINICAL_S3_BUCKET`, separate from report and photo buckets) with SSE-KMS
(`CLINICAL_S3_KMS_KEY_ID`), Block Public Access, `Cache-Control: no-store` and no CDN. The config
refuses to start in production if clinical images are enabled without S3, without a separate bucket,
or without a dedicated KMS key.

**Access:** `POST /api/lesion-images/:id/link` issues a 5-minute app link, HMAC-bound (dedicated
derived key) to image, variant, expiry and the caller's session, in every environment. No S3
presigned or other bearer URL ever leaves the server: bytes are streamed through `GET .../content`,
which re-checks signature, expiry, live session, role, scope and consent on every request, audits
the fetch, and serves `no-store`.

**Consent rules:** an image is viewable only while the consent it was captured under has not since
been withdrawn or declined, and for face images the same applies to face consent. A later re-grant
does not revive hidden images. Retention of hidden images follows ADR-16 (pending).

**Roles:** `clinical_image.capture/view/delete` are Doctor Admin only. Super Admin, Assistant and
participants are denied by default.

**Audit:** `consent.clinical_photo`, `consent.clinical_photo_face`, `lesion_image.capture`,
`.replace`, `.view`, `.download`, `.delete` and `.access` (denials). Details hold only the image id,
site, size and variant, never bytes, keys or URLs.
