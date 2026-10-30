import "server-only";
import crypto from "node:crypto";
import { db, type Queryable } from "../db";
import { config, patientMessagingAvailable } from "../config";
import { AppError, Errors } from "../errors";
import { audit } from "../audit";
import { can } from "../authz";
import { objectStore } from "../storage";
import { processClinicalImage } from "../clinicalImage";
import { assessQuality, QUALITY_MESSAGES, type Quality } from "../imageQuality";
import { hmac, safeEqual } from "../security/crypto";
import { createIntakeSession, type StaffSession } from "../security/session";
import { enqueueNotification, kickDispatcher, retryNotification, sendLoginCode } from "../notify";
import { currentConsents, hasConsent } from "./common";
import { loadQuestionnaire } from "./questionnaire";
import {
  MOUTH_VIEWS, RECOMMENDED_VIEWS, SUBMITTED_MESSAGE, renderTemplate, reviewStatusLabel, viewLabel,
  type MouthView, type ReviewOutcome, type VirtualCaseStatus,
} from "@/lib/shared/virtual";
import { TUTORIAL_VERSION, type TutorialLang } from "@/lib/shared/tutorial";

// Virtual screening (PRD addendum): patients (or a caregiver) photograph their own mouth and
// submit with their questionnaire; authorised doctors review remotely and record an outcome.
// Nothing here diagnoses: image checks only help the patient take a usable photo.

const TICKET_TTL_SEC = 10 * 60;
const MAX_CONCERN_IMAGES = 3;
const EDITABLE: VirtualCaseStatus[] = ["awaiting_images", "more_images_requested"];
const REVIEWABLE: VirtualCaseStatus[] = ["submitted", "in_review"];

export function assertVirtualEnabled() {
  if (!config().VIRTUAL_SCREENING_ENABLED) {
    throw Errors.disabled("Virtual screening is not open yet. It starts once the photography instructions, consent wording and messages are approved.");
  }
}

type CaseRow = {
  id: string; patient_id: string; status: VirtualCaseStatus; round: number; submitted_at: string | null;
  assistance_requested_at: string | null; assistance_note: string | null; outcome: ReviewOutcome | null;
  outcome_notes: string | null; next_steps: string | null; lesion_location: string | null; reviewed_by: string | null; reviewed_at: string | null; created_at: string;
  tutorial_completed_at: string | null; tutorial_language: TutorialLang | null; tutorial_version: string | null;
  photos_captured_at: string | null; uploads_confirmed_at: string | null; review_started_at: string | null;
};
type ImageRow = {
  id: string; case_id: string; patient_id: string; view: MouthView; round: number; captured_by: string; object_key: string; preview_key: string;
  mime: string; bytes: number; width: number; height: number; quality: Quality; submitted: boolean; review_status: "pending" | "acceptable" | "needs_retake";
  review_note: string | null; reviewed_by: string | null; reviewed_at: string | null; removed_at: string | null; created_at: string;
};

async function caseForPatient(q: Queryable, patientId: string, forUpdate = false): Promise<CaseRow> {
  const c = (await q.query<CaseRow>(`select * from virtual_cases where patient_id = $1 ${forUpdate ? "for update" : ""}`, [patientId])).rows[0];
  if (!c) throw Errors.notFound();
  return c;
}

/** Current image per view = the newest image the patient has not removed. */
async function currentImages(q: Queryable, caseId: string): Promise<ImageRow[]> {
  return (await q.query<ImageRow>(
    `select distinct on (view, case when view = 'concern' then id::text else '' end) *
       from virtual_images where case_id = $1 and removed_at is null
      order by view, case when view = 'concern' then id::text else '' end, created_at desc`,
    [caseId],
  )).rows;
}

/**
 * Recommended views not yet photographed (or marked for a retake). Guidance for the participant and
 * the doctor; it no longer blocks submission — any reasonably clear photos can be sent and the
 * doctor asks for more if needed.
 */
function missingRecommended(images: ImageRow[]): MouthView[] {
  const latest = new Map(images.filter((i) => i.view !== "concern").map((i) => [i.view, i]));
  return RECOMMENDED_VIEWS.filter((v) => !latest.get(v) || latest.get(v)!.review_status === "needs_retake");
}

const previewUrl = (imageId: string) => `/api/intake/virtual/images/${imageId}`;

export type TimelineEvent = { key: string; label: string; at: string | null; optional?: boolean };
const REQUIRED_CONSENTS = ["registration", "screening", "remote_images", "review_notifications"] as const;

/**
 * The patient timeline (updated requirements section 8), in order. Capture, upload, consent and
 * review are separate events; "if applicable" events are listed only when they apply.
 */
async function caseTimeline(q: Queryable, c: CaseRow): Promise<TimelineEvent[]> {
  const [p, consents, questionnaire, review, sent] = await Promise.all([
    q.query<{ created_at: string }>("select created_at from patients where id = $1", [c.patient_id]),
    currentConsents(q, c.patient_id),
    q.query<{ completed_at: string | null }>("select max(completed_at) as completed_at from questionnaire_submissions where patient_id = $1 and status = 'completed'", [c.patient_id]),
    q.query<{ inconclusive_action: string | null }>("select inconclusive_action from virtual_reviews where case_id = $1 order by created_at desc limit 1", [c.id]),
    q.query<{ at: string | null }>(
      "select max(updated_at) as at from notifications where patient_id = $1 and template = 'review_suspicious' and status in ('sent', 'delivered', 'read')", [c.patient_id]),
  ]);
  const consentTimes = REQUIRED_CONSENTS.map((t) => (consents[t]?.status === "granted" ? new Date(consents[t]!.at).toISOString() : null));
  const done = c.status === "reviewed" || c.status === "closed";
  const waiting = c.status === "awaiting_images" || c.status === "more_images_requested";
  const followUp = done && (c.outcome === "suspicious" || (c.outcome === "inconclusive" && review.rows[0]?.inconclusive_action === "in_person"));
  const events: TimelineEvent[] = [
    { key: "registered", label: "Registered", at: p.rows[0]?.created_at ?? null },
    { key: "questionnaire", label: "Questionnaire Completed", at: questionnaire.rows[0]?.completed_at ?? null },
    { key: "consents", label: "Required Consents Recorded", at: consentTimes.every(Boolean) ? (consentTimes as string[]).sort().at(-1)! : null },
    { key: "tutorial", label: "Tutorial Completed", at: c.tutorial_completed_at },
    { key: "captured", label: "Five Photos Captured", at: c.photos_captured_at },
    { key: "uploaded", label: "Photo Upload Completed", at: c.uploads_confirmed_at },
    { key: "submitted", label: "Submitted for Doctor Review", at: waiting ? null : c.submitted_at },
    { key: "review_started", label: "Doctor Review Started", at: waiting ? null : c.review_started_at },
    { key: "review_completed", label: "Doctor Review Completed", at: done ? c.reviewed_at : null },
  ];
  if (followUp) {
    events.push({ key: "follow_up", label: "Follow-up Required", at: c.reviewed_at, optional: true });
    events.push({ key: "follow_up_sent", label: "Follow-up Notification Sent", at: sent.rows[0]?.at ?? null, optional: true });
  }
  return events;
}

// ---------------------------------------------------------------- patient side

export async function patientCase(patientId: string) {
  assertVirtualEnabled();
  const d = await db();
  const c = await caseForPatient(d, patientId);
  const images = await currentImages(d, c.id);
  const consents = await currentConsents(d, patientId);
  const missing = missingRecommended(images);
  return {
    status: c.status,
    statusLabel: reviewStatusLabel(c.status, c.outcome),
    round: c.round,
    // Watching the guide unlocks photo capture. It is recorded for the timeline only, never as consent.
    tutorial: { completedAt: c.tutorial_completed_at, language: c.tutorial_language, version: c.tutorial_version, current: TUTORIAL_VERSION },
    timeline: await caseTimeline(d, c),
    submittedMessage: c.status === "submitted" || c.status === "in_review" ? SUBMITTED_MESSAGE : null,
    canEdit: EDITABLE.includes(c.status),
    imagesConsent: consents.remote_images?.status === "granted",
    assistanceRequested: !!c.assistance_requested_at,
    submittedAt: c.submitted_at,
    missingRecommended: missing,
    images: images.map((i) => ({
      id: i.id, view: i.view, flags: i.quality.flags ?? [], submitted: i.submitted,
      retakeRequested: i.review_status === "needs_retake", previewUrl: previewUrl(i.id), createdAt: i.created_at,
    })),
    // The patient sees the same wording they receive by message; never clinical notes.
    resultMessage: c.status === "reviewed" || c.status === "closed"
      ? renderTemplate(c.outcome === "no_suspicious" ? "review_no_lesion" : "review_suspicious", { name: "", clinic: config().NOTIFY_CLINIC_NAME, phone: config().NOTIFY_CLINIC_PHONE }).replace(/^Dear ,\s*/, "")
      : null,
    clinic: { name: config().NOTIFY_CLINIC_NAME, phone: config().NOTIFY_CLINIC_PHONE },
  };
}

/** Records that the patient watched the mandatory photo guide to the end (language, version, time). */
export async function completeTutorial(patientId: string, input: { language: TutorialLang; version: string }, correlationId: string) {
  assertVirtualEnabled();
  if (input.version !== TUTORIAL_VERSION) throw Errors.conflict("The photo guide has been updated. Please reload the page and watch it again.", "tutorial_outdated");
  const d = await db();
  return d.tx(async (q) => {
    const c = await caseForPatient(q, patientId, true);
    await q.query(
      "update virtual_cases set tutorial_completed_at = now(), tutorial_language = $2, tutorial_version = $3, updated_at = now() where id = $1",
      [c.id, input.language, input.version],
    );
    await audit({ actorType: "participant", action: "virtual_tutorial.complete", targetType: "patient", targetRef: patientId, outcome: "success", correlationId,
      details: { language: input.language, version: input.version } }, q);
    return { completed: true };
  });
}

async function assertCanUpload(q: Queryable, patientId: string, c: CaseRow) {
  if (!c.tutorial_completed_at) throw new AppError(409, "tutorial_required", "Please watch the photo guide to the end before taking photos.");
  if (!EDITABLE.includes(c.status)) throw Errors.gated("Your photos have been submitted. We will message you if the doctor needs new photos.");
  const consentId = await hasConsent(q, patientId, "remote_images");
  if (!consentId) throw Errors.gated("Consent to submit mouth photos is needed first.");
  return consentId;
}

/** Issues a short-lived upload target. In production this is a presigned S3 PUT to a quarantine key. */
export async function createUploadTicket(patientId: string, input: { view: MouthView; contentType: string; bytes: number; capturedBy: "patient" | "caregiver" }, correlationId: string) {
  assertVirtualEnabled();
  if (input.bytes > config().CLINICAL_IMAGE_MAX_BYTES) throw Errors.tooLarge();
  const d = await db();
  const c = await caseForPatient(d, patientId);
  await assertCanUpload(d, patientId, c);
  if (input.view === "concern") {
    const n = (await currentImages(d, c.id)).filter((i) => i.view === "concern").length;
    if (n >= MAX_CONCERN_IMAGES) throw Errors.conflict(`You can add up to ${MAX_CONCERN_IMAGES} photos of areas that worry you. Remove one to add another.`, "too_many_images");
  }
  const id = crypto.randomUUID();
  const key = `quarantine/${patientId}/${crypto.randomUUID()}.upload`;
  await d.query(
    `insert into virtual_upload_tickets (id, patient_id, case_id, view, captured_by, quarantine_key, content_type, expires_at)
     values ($1, $2, $3, $4, $5, $6, $7, now() + make_interval(secs => $8))`,
    [id, patientId, c.id, input.view, input.capturedBy, key, input.contentType, TICKET_TTL_SEC],
  );
  const store = objectStore("clinical");
  const uploadUrl = store.signedUploadUrl ? await store.signedUploadUrl(key, TICKET_TTL_SEC, input.contentType) : `/api/intake/virtual/uploads/${id}`;
  await audit({ actorType: "participant", action: "virtual_image.ticket", targetType: "patient", targetRef: patientId, outcome: "success", correlationId, details: { view: input.view } });
  return { ticketId: id, uploadUrl, method: "PUT" as const, headers: { "content-type": input.contentType }, direct: !!store.signedUploadUrl, expiresInSec: TICKET_TTL_SEC };
}

type Ticket = { id: string; patient_id: string; case_id: string; view: MouthView; captured_by: "patient" | "caregiver"; quarantine_key: string; content_type: string; expires_at: string; completed_at: string | null; image_id: string | null; expired: boolean };
async function loadTicket(q: Queryable, patientId: string, ticketId: string): Promise<Ticket> {
  const t = (await q.query<Ticket>("select *, expires_at < now() as expired from virtual_upload_tickets where id = $1 and patient_id = $2", [ticketId, patientId])).rows[0];
  if (!t) throw Errors.notFound();
  return t;
}

/** Non-S3 drivers: the browser uploads the bytes through the app into the quarantine key. */
export async function receiveUpload(patientId: string, ticketId: string, data: Buffer, contentType: string) {
  assertVirtualEnabled();
  const d = await db();
  const t = await loadTicket(d, patientId, ticketId);
  if (t.expired || t.completed_at) throw new AppError(410, "ticket_expired", "This upload link has expired. Please try again.");
  if (contentType !== t.content_type) throw Errors.unsupported("The file type does not match.");
  const store = objectStore("clinical");
  await store.delete(t.quarantine_key).catch(() => {}); // a retried PUT replaces the earlier attempt
  await store.put(t.quarantine_key, data, "application/octet-stream");
  return { ok: true };
}

/** Validates the quarantined upload, strips metadata, checks quality and links it to the case. */
export async function completeUpload(patientId: string, ticketId: string, correlationId: string) {
  assertVirtualEnabled();
  const d = await db();
  const t = await loadTicket(d, patientId, ticketId);
  if (t.image_id) return imageResult(d, t.image_id, true); // retried completion: same image
  if (t.expired && !t.completed_at) {
    // Allow a little grace after expiry for slow mobile uploads; beyond that start again.
    const late = (await d.query<{ late: boolean }>("select expires_at < now() - interval '15 minutes' as late from virtual_upload_tickets where id = $1", [t.id])).rows[0]!.late;
    if (late) throw new AppError(410, "ticket_expired", "This upload took too long. Please try again.");
  }
  const store = objectStore("clinical");
  // Presigned S3 uploads are not size-limited by S3: check the real size before reading anything.
  if (store.size) {
    const size = await store.size(t.quarantine_key);
    if (size === null) throw Errors.conflict("We did not receive the photo. Please try again.", "upload_missing");
    if (size > config().CLINICAL_IMAGE_MAX_BYTES) {
      await store.delete(t.quarantine_key).catch(() => {});
      throw Errors.tooLarge();
    }
  }
  const raw = await store.get(t.quarantine_key);
  if (!raw) throw Errors.conflict("We did not receive the photo. Please try again.", "upload_missing");
  let processed;
  try {
    processed = await processClinicalImage(raw.data);
  } finally {
    await store.delete(t.quarantine_key).catch(() => {}); // untrusted bytes never linger
  }
  const quality = await assessQuality(processed.preview);
  const imageId = crypto.randomUUID();
  const objectKey = `remote/${patientId}/${imageId}.${processed.ext}`;
  const previewKey = `remote/${patientId}/${imageId}-preview.webp`;
  try {
    await store.put(objectKey, processed.original, processed.mime);
    await store.put(previewKey, processed.preview, "image/webp");
  } catch {
    await Promise.all([store.delete(objectKey), store.delete(previewKey)].map((p) => p.catch(() => {})));
    throw new AppError(503, "storage_unavailable", "We could not save the photo just now. Please try again.", undefined, 5);
  }
  const replaced: string[] = [];
  try {
    await d.tx(async (q) => {
      const c = await caseForPatient(q, patientId, true); // re-check under lock (submit/withdraw races)
      const consentId = await assertCanUpload(q, patientId, c);
      if (t.view === "concern") {
        const n = (await currentImages(q, c.id)).filter((i) => i.view === "concern").length;
        if (n >= MAX_CONCERN_IMAGES) throw Errors.conflict(`You can add up to ${MAX_CONCERN_IMAGES} photos of areas that worry you.`, "too_many_images");
      }
      if (t.view !== "concern") {
        // A retake replaces the earlier photo the patient has not sent yet; it is deleted, never shown to doctors.
        const old = (await q.query<{ object_key: string; preview_key: string }>(
          "update virtual_images set removed_at = now() where case_id = $1 and view = $2 and not submitted and removed_at is null returning object_key, preview_key",
          [c.id, t.view],
        )).rows;
        for (const o of old) replaced.push(o.object_key, o.preview_key);
      }
      await q.query(
        `insert into virtual_images (id, case_id, patient_id, view, round, consent_id, captured_by, storage_driver, object_key, preview_key, mime, bytes, width, height, sha256, metadata_removed, quality)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)`,
        [imageId, c.id, patientId, t.view, c.round, consentId, t.captured_by, store.driver, objectKey, previewKey, processed.mime, processed.original.length,
          processed.width, processed.height, processed.sha256, processed.removed, JSON.stringify(quality)],
      );
      const done = await q.query("update virtual_upload_tickets set completed_at = now(), image_id = $2 where id = $1 and image_id is null returning id", [t.id, imageId]);
      if (!done.rows.length) throw new AppError(409, "duplicate_completion", "Already saved.");
      // The first saved photo of a round marks capture as started (recommended views are advisory).
      await q.query("update virtual_cases set photos_captured_at = coalesce(photos_captured_at, now()) where id = $1", [c.id]);
      await audit({ actorType: "participant", action: "virtual_image.upload", targetType: "patient", targetRef: patientId, outcome: "success", correlationId,
        details: { view: t.view, bytes: processed.original.length, flags: quality.flags, by: t.captured_by } }, q);
    });
  } catch (e) {
    await Promise.all([store.delete(objectKey), store.delete(previewKey)].map((p) => p.catch(() => {})));
    if (e instanceof AppError && e.code === "duplicate_completion") {
      const again = (await d.query<{ image_id: string }>("select image_id from virtual_upload_tickets where id = $1", [t.id])).rows[0]!;
      return imageResult(d, again.image_id, true);
    }
    throw e;
  }
  await Promise.all(replaced.map((k) => store.delete(k).catch(() => {})));
  return imageResult(d, imageId, false);
}

async function imageResult(q: Queryable, imageId: string, replayed: boolean) {
  const i = (await q.query<ImageRow>("select * from virtual_images where id = $1", [imageId])).rows[0]!;
  const flags = i.quality.flags ?? [];
  return { image: { id: i.id, view: i.view, flags, previewUrl: previewUrl(i.id) }, warnings: flags.map((f) => QUALITY_MESSAGES[f]), replayed };
}

export async function removeImage(patientId: string, imageId: string, correlationId: string) {
  assertVirtualEnabled();
  const d = await db();
  const keys = await d.tx(async (q) => {
    const c = await caseForPatient(q, patientId, true);
    if (!EDITABLE.includes(c.status)) throw Errors.gated("Submitted photos cannot be removed.");
    const r = (await q.query<{ object_key: string; preview_key: string; view: string }>(
      "update virtual_images set removed_at = now() where id = $1 and case_id = $2 and patient_id = $3 and removed_at is null and not submitted returning object_key, preview_key, view",
      [imageId, c.id, patientId],
    )).rows[0];
    if (!r) throw Errors.notFound();
    await audit({ actorType: "participant", action: "virtual_image.remove", targetType: "patient", targetRef: patientId, outcome: "success", correlationId, details: { view: r.view } }, q);
    return [r.object_key, r.preview_key];
  });
  // Unsubmitted photos the patient removed are deleted, not kept.
  await Promise.all(keys.map((k) => objectStore("clinical").delete(k).catch(() => {})));
  return { ok: true };
}

export async function requestAssistance(patientId: string, note: string | undefined, correlationId: string) {
  assertVirtualEnabled();
  const d = await db();
  await d.tx(async (q) => {
    const c = await caseForPatient(q, patientId, true);
    await q.query("update virtual_cases set assistance_requested_at = now(), assistance_note = $2, updated_at = now() where id = $1", [c.id, note || null]);
    await audit({ actorType: "participant", action: "virtual_case.assistance", targetType: "patient", targetRef: patientId, outcome: "success", correlationId }, q);
  });
  return { ok: true, clinic: { name: config().NOTIFY_CLINIC_NAME, phone: config().NOTIFY_CLINIC_PHONE } };
}

export async function submitCase(patientId: string, correlationId: string) {
  assertVirtualEnabled();
  const d = await db();
  // The upload is confirmed only when every photo is actually readable in private storage
  // (checked before the transaction: object storage calls must not hold the case lock).
  const store = objectStore("clinical");
  const pre = await caseForPatient(d, patientId);
  const toCheck = await currentImages(d, pre.id);
  const unreadable: string[] = [];
  for (const i of toCheck) {
    const ok = store.size ? (await store.size(i.object_key)) !== null : !!(await store.get(i.object_key));
    if (!ok) unreadable.push(viewLabel(i.view));
  }
  if (unreadable.length) {
    throw new AppError(409, "upload_incomplete", `These photos did not finish uploading: ${unreadable.join(", ")}. Please take them again.`);
  }
  const checked = toCheck.map((i) => i.id).sort();
  const r = await d.tx(async (q) => {
    const c = await caseForPatient(q, patientId, true);
    if (!EDITABLE.includes(c.status)) throw Errors.gated("Your photos have already been submitted.");
    const images = await currentImages(q, c.id);
    const missing = missingRecommended(images);
    // Any reasonably clear photos may be submitted; the doctor asks for more views if needed.
    if (!images.length) throw Errors.validation({ images: "Add at least one photo before submitting." });
    if (images.map((i) => i.id).sort().join() !== checked.join()) throw Errors.conflict("Your photos changed while sending. Please submit again.", "photos_changed");
    await q.query("update virtual_images set submitted = true where id = any($1::uuid[]) and not submitted", [images.map((i) => i.id)]);
    await q.query(
      `update virtual_cases set status = 'submitted', submitted_at = now(), uploads_confirmed_at = now(),
              photos_captured_at = coalesce(photos_captured_at, now()), updated_at = now() where id = $1`, [c.id]);
    await audit({ actorType: "participant", action: "virtual_case.submit", targetType: "patient", targetRef: patientId, outcome: "success", correlationId, details: { round: c.round, images: images.length, missingRecommended: missing.length } }, q);
    await enqueueNotification(q, { patientId, caseId: c.id, template: "submission_received", idempotencyKey: `vc-${c.id}-r${c.round}-received`, correlationId });
    return { status: "submitted" as const };
  });
  kickDispatcher();
  return r;
}

/** The patient's own preview image (never anyone else's; withdrawn/removed images are gone). */
export async function patientImage(patientId: string, imageId: string) {
  assertVirtualEnabled();
  const d = await db();
  const i = (await d.query<{ preview_key: string }>("select preview_key from virtual_images where id = $1 and patient_id = $2 and removed_at is null", [imageId, patientId])).rows[0];
  if (!i) throw Errors.notFound();
  const obj = await objectStore("clinical").get(i.preview_key);
  if (!obj) throw Errors.notFound();
  return obj.data;
}

// ---------------------------------------------------------------- returning patients: login code

const OTP_TTL_MIN = 10;
const OTP_MAX_ATTEMPTS = 5;
/** Across all codes: at most this many codes and this many wrong guesses per participant per 24 hours. */
const OTP_DAILY_CODES = 5;
const OTP_DAILY_FAILURES = 10;
const otpHash = (patientId: string, code: string) => hmac(`otp:${patientId}:${code}`);

async function findParticipant(q: Queryable, displayId: string, mobile: string) {
  return (await q.query<{ id: string }>("select id from patients where display_id = $1 and mobile = $2 and status <> 'withdrawn'", [displayId, mobile])).rows[0];
}

/** Always answers the same way whether or not the details match (no account probing). */
export async function requestLoginCode(input: { displayId: string; mobile: string }, correlationId: string) {
  if (!patientMessagingAvailable()) {
    // Pilot without WhatsApp: a code could never arrive, so say so instead of pretending to send one.
    await audit({ actorType: "anonymous", action: "intake.otp_request", outcome: "denied", correlationId, code: "no_channel" });
    const c = config();
    return { ok: false as const, unavailable: true as const, message: `Logging in with a code is not available yet. Please use the resume link you received when registering, or contact ${c.NOTIFY_CLINIC_NAME} at ${c.NOTIFY_CLINIC_PHONE}.` };
  }
  const d = await db();
  // Limited by the entered details *before* the lookup, so the limit behaves the same whether or not they match.
  const { enforceRateLimit, LIMITS } = await import("../security/rateLimit");
  await enforceRateLimit(LIMITS.otpRequestPatient, hmac(`otp-id:${input.displayId}:${input.mobile}`));
  const p = await findParticipant(d, input.displayId, input.mobile);
  let devCode: string | undefined;
  const recent = p ? (await d.query<{ n: number }>("select count(*)::int as n from participant_otps where patient_id = $1 and created_at > now() - interval '24 hours'", [p.id])).rows[0]!.n : 0;
  if (p && recent < OTP_DAILY_CODES) {
    const code = String(crypto.randomInt(0, 1_000_000)).padStart(6, "0");
    await d.query("update participant_otps set used_at = now() where patient_id = $1 and used_at is null", [p.id]);
    await d.query("insert into participant_otps (patient_id, code_hash, expires_at) values ($1, $2, now() + make_interval(mins => $3))", [p.id, otpHash(p.id, code), OTP_TTL_MIN]);
    // Sent off the request path so both branches answer in about the same time.
    void sendLoginCode(p.id, code).catch(() => {});
    await audit({ actorType: "participant", action: "intake.otp_request", targetType: "patient", targetRef: p.id, outcome: "success", correlationId });
    // Local development only: no real messages are sent, so show the code to the tester.
    if (config().NOTIFY_DRIVER === "console" && !config().isProd) devCode = code;
  } else {
    await audit({ actorType: "anonymous", action: "intake.otp_request", outcome: "denied", correlationId, code: p ? "daily_limit" : "no_match" });
  }
  return { ok: true, message: "If the details match a registration, we have sent a 6-digit code to that mobile number on WhatsApp.", ...(devCode ? { devCode } : {}) };
}

export async function verifyLoginCode(input: { displayId: string; mobile: string; code: string }, correlationId: string) {
  const d = await db();
  const fail = () => new AppError(401, "invalid_code", "That code is not right or has expired. Request a new code.");
  // The wrong-guess counter must be committed, so failures are returned (not thrown) from the transaction.
  const r = await d.tx(async (q) => {
    const p = await findParticipant(q, input.displayId, input.mobile);
    if (!p) return null;
    const otp = (await q.query<{ id: string; code_hash: string; attempts: number }>(
      "select id, code_hash, attempts from participant_otps where patient_id = $1 and used_at is null and expires_at > now() order by created_at desc limit 1 for update",
      [p.id],
    )).rows[0];
    if (!otp || otp.attempts >= OTP_MAX_ATTEMPTS) return null;
    const failures = (await q.query<{ n: number }>("select coalesce(sum(attempts), 0)::int as n from participant_otps where patient_id = $1 and created_at > now() - interval '24 hours'", [p.id])).rows[0]!.n;
    if (failures >= OTP_DAILY_FAILURES) return null; // locked for the day: contact the clinic
    if (!safeEqual(otp.code_hash, otpHash(p.id, input.code))) {
      await q.query("update participant_otps set attempts = attempts + 1 where id = $1", [otp.id]);
      await audit({ actorType: "anonymous", action: "intake.otp_verify", targetType: "patient", targetRef: p.id, outcome: "denied", correlationId, code: "wrong_code" }, q);
      return null;
    }
    await q.query("update participant_otps set used_at = now() where id = $1", [otp.id]);
    const session = await createIntakeSession(p.id, q);
    await audit({ actorType: "participant", action: "intake.otp_verify", targetType: "patient", targetRef: p.id, outcome: "success", correlationId }, q);
    return session;
  });
  if (!r) throw fail();
  return r;
}

// ---------------------------------------------------------------- doctor side

function requireReviewer(staff: StaffSession) {
  if (!can(staff.role, "virtual.review")) throw Errors.forbidden();
}

const staffImageUrl = (id: string, v: "preview" | "full") => `/api/virtual/images/${id}?v=${v}`;

export async function reviewQueue(staff: StaffSession, filter: "awaiting_review" | "more_images_requested" | "reviewed" | "help" | "awaiting_images" | "all") {
  assertVirtualEnabled();
  requireReviewer(staff);
  const d = await db();
  const where = {
    awaiting_review: "c.status in ('submitted', 'in_review')",
    more_images_requested: "c.status = 'more_images_requested'",
    reviewed: "c.status in ('reviewed', 'closed')",
    help: "c.assistance_requested_at is not null and c.status in ('awaiting_images', 'more_images_requested', 'submitted', 'in_review')",
    awaiting_images: "c.status = 'awaiting_images'",
    all: "true",
  }[filter];
  const rows = (await d.query<{
    id: string; status: VirtualCaseStatus; round: number; submitted_at: string | null; assistance_requested_at: string | null; outcome: ReviewOutcome | null; reviewed_at: string | null;
    display_id: string; full_name: string; age: number; district: string | null; created_at: string; image_ids: string[] | null; retakes: number;
  }>(
    `select c.id, c.status, c.round, c.submitted_at, c.assistance_requested_at, c.outcome, c.reviewed_at,
            p.display_id, p.full_name, p.age, p.district, c.created_at,
            (select array_agg(i.id order by i.created_at) from (select id, created_at from virtual_images where case_id = c.id and removed_at is null and submitted order by created_at desc limit 4) i) as image_ids,
            (select count(*)::int from virtual_images where case_id = c.id and removed_at is null and review_status = 'needs_retake') as retakes
       from virtual_cases c join patients p on p.id = c.patient_id
      where p.status <> 'withdrawn' and ${where}
      order by coalesce(c.submitted_at, c.created_at) asc
      limit 200`,
  )).rows;
  return {
    items: rows.map((r) => ({
      id: r.id, status: r.status, statusLabel: reviewStatusLabel(r.status, r.outcome), round: r.round, submittedAt: r.submitted_at, assistance: !!r.assistance_requested_at,
      outcome: r.outcome, reviewedAt: r.reviewed_at, displayId: r.display_id, fullName: r.full_name, age: r.age, district: r.district, retakes: r.retakes,
      thumbs: (r.image_ids ?? []).map((id) => staffImageUrl(id, "preview")),
    })),
  };
}

async function loadCase(q: Queryable, caseId: string, forUpdate = false) {
  const c = (await q.query<CaseRow>(`select * from virtual_cases where id = $1 ${forUpdate ? "for update" : ""}`, [caseId])).rows[0];
  if (!c) throw Errors.notFound();
  return c;
}

export async function caseDetail(staff: StaffSession, caseId: string, correlationId: string) {
  assertVirtualEnabled();
  requireReviewer(staff);
  const d = await db();
  let c = await loadCase(d, caseId);
  if (c.status === "submitted") {
    // First doctor to open a submitted case starts the review.
    await d.query("update virtual_cases set status = 'in_review', review_started_at = now(), updated_at = now() where id = $1 and status = 'submitted'", [c.id]);
    c = await loadCase(d, caseId);
  }
  const p = (await d.query<{ id: string; display_id: string; full_name: string; age: number; mobile: string | null; driver_type: string; district: string | null; mandal: string | null; pincode: string | null; address_line: string | null; preferred_language: string; status: string; created_at: string }>(
    "select id, display_id, full_name, age, mobile, driver_type, district, mandal, pincode, address_line, preferred_language, status, created_at from patients where id = $1", [c.patient_id])).rows[0]!;
  const [images, reviews, followups, notes, consents, questionnaire] = await Promise.all([
    d.query<ImageRow & { reviewer: string | null }>(
      `select i.*, u.display_name as reviewer from virtual_images i left join users u on u.id = i.reviewed_by
        where i.case_id = $1 and i.removed_at is null and i.submitted order by i.round desc, i.view, i.created_at desc`, [c.id]),
    d.query<{ id: string; round: number; decision: string; inconclusive_action: string | null; notes: string | null; next_steps: string | null; lesion_location: string | null; created_at: string; reviewer: string }>(
      "select r.id, r.round, r.decision, r.inconclusive_action, r.notes, r.next_steps, r.lesion_location, r.created_at, u.display_name as reviewer from virtual_reviews r join users u on u.id = r.reviewed_by where r.case_id = $1 order by r.created_at desc", [c.id]),
    d.query<{ id: string; action: string; note: string | null; created_at: string; by: string }>(
      "select f.id, f.action, f.note, f.created_at, u.display_name as by from virtual_followups f join users u on u.id = f.created_by where f.case_id = $1 order by f.created_at desc", [c.id]),
    d.query<{ id: string; template: string; status: string; attempts: number; last_error: string | null; created_at: string; updated_at: string }>(
      "select id, template, status, attempts, last_error, created_at, updated_at from notifications where patient_id = $1 and template <> 'login_code' order by created_at desc limit 50", [c.patient_id]),
    currentConsents(d, c.patient_id),
    loadQuestionnaire(c.patient_id),
  ]);
  const current = new Set((await currentImages(d, c.id)).map((i) => i.id));
  // Withdrawn photo consent hides every image from viewing (retention policy pending, ADR-16).
  const imagesHidden = consents.remote_images?.status !== "granted";
  const reviewer = c.reviewed_by ? (await d.query<{ display_name: string }>("select display_name from users where id = $1", [c.reviewed_by])).rows[0]?.display_name ?? null : null;
  await audit({ actorType: "staff", actorId: staff.userId, action: "virtual_case.view", targetType: "patient", targetRef: c.patient_id, outcome: "success", correlationId });
  return {
    case: {
      id: c.id, status: c.status, statusLabel: reviewStatusLabel(c.status, c.outcome), round: c.round, submittedAt: c.submitted_at,
      assistanceRequestedAt: c.assistance_requested_at, assistanceNote: c.assistance_note, outcome: c.outcome, outcomeNotes: c.outcome_notes,
      nextSteps: c.next_steps, lesionLocation: c.lesion_location, reviewedAt: c.reviewed_at, reviewedBy: reviewer, canDecide: REVIEWABLE.includes(c.status),
    },
    patient: {
      id: p.id, displayId: p.display_id, fullName: p.full_name, age: p.age, mobile: p.mobile, driverType: p.driver_type, district: p.district, mandal: p.mandal,
      pincode: p.pincode, addressLine: p.address_line, language: p.preferred_language, registeredAt: p.created_at, withdrawn: p.status === "withdrawn",
      notificationsConsent: consents.review_notifications?.status === "granted",
    },
    questionnaire: { status: questionnaire.status, items: questionnaire.items },
    imagesHidden,
    images: (imagesHidden ? [] : images.rows).map((i) => ({
      id: i.id, view: i.view, viewLabel: viewLabel(i.view), round: i.round, current: current.has(i.id), capturedBy: i.captured_by, flags: i.quality.flags ?? [],
      quality: { brightness: i.quality.brightness, sharpness: i.quality.sharpness }, width: i.width, height: i.height, submitted: i.submitted,
      reviewStatus: i.review_status, reviewNote: i.review_note, reviewedBy: i.reviewer, reviewedAt: i.reviewed_at, uploadedAt: i.created_at,
      previewUrl: staffImageUrl(i.id, "preview"), fullUrl: staffImageUrl(i.id, "full"),
    })),
    reviews: reviews.rows,
    followups: followups.rows,
    notifications: notes.rows,
    views: MOUTH_VIEWS.map((v) => ({ value: v.value, label: v.label, recommended: v.recommended })),
    timeline: await caseTimeline(d, c),
    tutorial: { completedAt: c.tutorial_completed_at, language: c.tutorial_language, version: c.tutorial_version },
    messagingAvailable: patientMessagingAvailable(),
  };
}

/** Image bytes for doctors. Previews are not individually audited (the case view is); full-size views are. */
export async function staffImage(staff: StaffSession, imageId: string, variant: "preview" | "full", correlationId: string) {
  assertVirtualEnabled();
  requireReviewer(staff);
  const d = await db();
  const i = (await d.query<{ patient_id: string; object_key: string; preview_key: string; mime: string; view: string }>(
    "select patient_id, object_key, preview_key, mime, view from virtual_images where id = $1 and removed_at is null and submitted", [imageId])).rows[0];
  if (!i || !(await hasConsent(d, i.patient_id, "remote_images"))) throw Errors.notFound();
  const obj = await objectStore("clinical").get(variant === "full" ? i.object_key : i.preview_key);
  if (!obj) throw Errors.notFound();
  if (variant === "full") await audit({ actorType: "staff", actorId: staff.userId, action: "virtual_image.view", targetType: "patient", targetRef: i.patient_id, outcome: "success", correlationId, details: { view: i.view } });
  return { data: obj.data, contentType: variant === "full" ? i.mime : "image/webp" };
}

export async function reviewImage(staff: StaffSession, imageId: string, input: { decision: "acceptable" | "needs_retake"; note?: string }, correlationId: string) {
  assertVirtualEnabled();
  requireReviewer(staff);
  const d = await db();
  return d.tx(async (q) => {
    const i = (await q.query<{ case_id: string; patient_id: string; view: string; submitted: boolean }>("select case_id, patient_id, view, submitted from virtual_images where id = $1 and removed_at is null", [imageId])).rows[0];
    if (!i) throw Errors.notFound();
    const c = await loadCase(q, i.case_id, true);
    if (!REVIEWABLE.includes(c.status) || !i.submitted) throw Errors.gated("This image is not awaiting review.");
    if (!(await hasConsent(q, i.patient_id, "remote_images"))) throw Errors.gated("The participant withdrew consent for their photos.");
    await q.query("update virtual_images set review_status = $2, review_note = $3, reviewed_by = $4, reviewed_at = now() where id = $1",
      [imageId, input.decision, input.note || null, staff.userId]);
    await audit({ actorType: "staff", actorId: staff.userId, action: "virtual_image.review", targetType: "patient", targetRef: i.patient_id, outcome: "success", correlationId, details: { view: i.view, decision: input.decision } }, q);
    return { ok: true };
  });
}

type Decision =
  | { decision: "more_images"; notes?: string }
  | { decision: "no_suspicious" | "suspicious" | "referral"; notes?: string; nextSteps?: string; lesionLocation?: string }
  | { decision: "inconclusive"; inconclusiveAction: "more_images" | "in_person"; notes?: string; nextSteps?: string; lesionLocation?: string };

/** Records the doctor's review and queues the matching patient message in the same transaction. */
export async function decideCase(staff: StaffSession, caseId: string, input: Decision, correlationId: string) {
  assertVirtualEnabled();
  requireReviewer(staff);
  const d = await db();
  const result = await d.tx(async (q) => {
    const c = await loadCase(q, caseId, true);
    if (!REVIEWABLE.includes(c.status)) throw Errors.gated("This case is not awaiting review.");
    const images = (await currentImages(q, c.id)).filter((i) => i.submitted);
    if (!images.length) throw Errors.gated("There are no submitted images to review.");
    const asksForImages = input.decision === "more_images" || (input.decision === "inconclusive" && input.inconclusiveAction === "more_images");
    if (!(await hasConsent(q, c.patient_id, "remote_images")) && !(input.decision === "inconclusive" && input.inconclusiveAction === "in_person")) {
      throw Errors.gated("The participant withdrew consent for their photos. Record the review as inconclusive with an in-person examination, or contact them.");
    }
    if (asksForImages && c.round >= 20) throw Errors.gated("Too many photo rounds. Invite the participant for an in-person examination instead.");
    if (asksForImages && !images.some((i) => i.review_status === "needs_retake") && !input.notes) {
      throw Errors.validation({ notes: "Mark at least one image as “Need clearer image”, or explain what is needed in the notes." });
    }
    if (input.decision === "no_suspicious") {
      // "No suspicious lesion" needs every submitted image reviewed as acceptable and all required views present.
      if (images.some((i) => i.review_status !== "acceptable")) throw Errors.gated("Review every image as acceptable before recording “No suspicious lesion”.");
    }
    const outcome: ReviewOutcome | null = input.decision === "more_images" ? null : input.decision;
    const nextSteps = "nextSteps" in input ? input.nextSteps || null : null;
    const lesionLocation = "lesionLocation" in input ? input.lesionLocation || null : null;
    await q.query(
      "insert into virtual_reviews (case_id, round, decision, inconclusive_action, notes, next_steps, lesion_location, reviewed_by) values ($1, $2, $3, $4, $5, $6, $7, $8)",
      [c.id, c.round, input.decision, input.decision === "inconclusive" ? input.inconclusiveAction : null, input.notes || null, nextSteps, lesionLocation, staff.userId],
    );
    if (asksForImages) {
      await q.query(
        `update virtual_cases set status = 'more_images_requested', round = round + 1, outcome = $2, outcome_notes = $3, next_steps = $4, lesion_location = $6,
                reviewed_by = $5, reviewed_at = now(), photos_captured_at = null, uploads_confirmed_at = null, review_started_at = null,
                updated_at = now() where id = $1`,
        [c.id, outcome, input.notes || null, nextSteps, staff.userId, lesionLocation],
      );
    } else {
      await q.query(
        "update virtual_cases set status = 'reviewed', outcome = $2, outcome_notes = $3, next_steps = $4, lesion_location = $6, reviewed_by = $5, reviewed_at = now(), updated_at = now() where id = $1",
        [c.id, outcome, input.notes || null, nextSteps, staff.userId, lesionLocation],
      );
    }
    // "suspicious", "referral" and an in-person "inconclusive" all ask for clinical evaluation (approved wording).
    const template = asksForImages ? "review_more_images" : input.decision === "no_suspicious" ? "review_no_lesion" : "review_suspicious";
    const queued = await enqueueNotification(q, { patientId: c.patient_id, caseId: c.id, template, idempotencyKey: `vc-${c.id}-r${c.round}-${template}`, createdBy: staff.userId, correlationId });
    await audit({ actorType: "staff", actorId: staff.userId, action: "virtual_case.review", targetType: "patient", targetRef: c.patient_id, outcome: "success", correlationId,
      details: { decision: input.decision, round: c.round, message: "skipped" in queued ? queued.skipped : template } }, q);
    return { status: asksForImages ? "more_images_requested" : "reviewed", notification: "skipped" in queued ? { skipped: queued.skipped } : { queued: template } };
  });
  kickDispatcher();
  return result;
}

export async function addFollowup(staff: StaffSession, caseId: string, input: { action: string; note?: string }, correlationId: string) {
  assertVirtualEnabled();
  requireReviewer(staff);
  const d = await db();
  return d.tx(async (q) => {
    const c = await loadCase(q, caseId, true);
    if (!["reviewed", "closed"].includes(c.status) && input.action !== "note" && input.action !== "called" && input.action !== "no_answer") {
      throw Errors.gated("Record the review outcome before follow-up actions.");
    }
    await q.query("insert into virtual_followups (case_id, action, note, created_by) values ($1, $2, $3, $4)", [c.id, input.action, input.note || null, staff.userId]);
    if (input.action === "closed") await q.query("update virtual_cases set status = 'closed', updated_at = now() where id = $1", [c.id]);
    await audit({ actorType: "staff", actorId: staff.userId, action: "virtual_case.followup", targetType: "patient", targetRef: c.patient_id, outcome: "success", correlationId, details: { action: input.action } }, q);
    return { ok: true };
  });
}

export async function retryCaseNotification(staff: StaffSession, notificationId: string, correlationId: string) {
  assertVirtualEnabled();
  requireReviewer(staff);
  const ok = await retryNotification(notificationId);
  if (!ok) throw Errors.conflict("Only failed messages can be resent.", "not_failed");
  await audit({ actorType: "staff", actorId: staff.userId, action: "notification.retry", outcome: "success", correlationId, targetType: "notification", targetRef: notificationId });
  return { ok: true };
}
