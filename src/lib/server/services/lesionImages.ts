import "server-only";
import crypto from "node:crypto";
import { db, type Queryable } from "../db";
import { config } from "../config";
import { AppError, Errors } from "../errors";
import { audit } from "../audit";
import { can, inCampScope } from "../authz";
import { objectStore } from "../storage";
import { processClinicalImage } from "../clinicalImage";
import { hashToken, hmac, safeEqual, sha256 } from "../security/crypto";
import { readStaffSession, type StaffSession } from "../security/session";
import { CONSENT_POLICIES, LANGUAGE_CODES, LESION_SITES, type ConsentType } from "@/lib/shared/constants";
import { currentConsents, loadPatientForStaff } from "./common";

// Oral lesion image capture (PRD v1.2). Clinical documentation for authorised professional
// review — never a diagnosis, never AI-interpreted, never sent to reports, WhatsApp, analytics
// or social metadata. Doctor Admin only; every check is enforced here on the server.

export const LINK_TTL_SEC = 300;
export type LinkVariant = "view" | "download" | "preview";
export type ClinicalPhotoStatus = "granted" | "declined" | "withdrawn" | "not_recorded" | "not_applicable";

export function assertClinicalImagesEnabled() {
  if (!config().CLINICAL_IMAGES_ENABLED) {
    throw Errors.disabled("Clinical photography is not enabled. It stays off until the photography protocol, consent wording, access scope and retention policy are approved.");
  }
}

function requirePermission(staff: StaffSession, p: "clinical_image.capture" | "clinical_image.view" | "clinical_image.delete") {
  if (!can(staff.role, p)) throw Errors.forbidden();
}

const siteLabel = (v: string) => LESION_SITES.find((s) => s.value === v)?.label ?? v;

/**
 * An image stays viewable only while the consent it was captured under has not since been
 * withdrawn or declined (and, for images that include the face, the same for face consent).
 * A later re-grant therefore never revives images hidden by an earlier withdrawal.
 */
const VISIBLE = `
  li.deleted_at is null
  and not exists (
    select 1 from consents w, consents g
     where g.id = li.consent_id and w.patient_id = li.patient_id and w.consent_type = 'clinical_photo'
       and w.status in ('withdrawn', 'declined') and w.created_at > g.created_at)
  and (not li.includes_face or not exists (
    select 1 from consents w, consents g
     where g.id = li.face_consent_id and w.patient_id = li.patient_id and w.consent_type = 'clinical_photo_face'
       and w.status in ('withdrawn', 'declined') and w.created_at > g.created_at))`;

async function latestExam(q: Queryable, patientId: string) {
  return (await q.query<{ id: string; version: number; status: "draft" | "verified"; lesion_present: string | null; lesion_sites: string[] }>(
    "select id, version, status, lesion_present, lesion_sites from exam_records where patient_id = $1 order by version desc limit 1", [patientId])).rows[0];
}

export async function clinicalPhotoStatus(q: Queryable, patientId: string): Promise<{ photo: ClinicalPhotoStatus; face: "granted" | "declined" | "withdrawn" | "not_recorded" }> {
  const c = await currentConsents(q, patientId);
  const exam = await latestExam(q, patientId);
  const photo: ClinicalPhotoStatus = c.clinical_photo?.status ?? (exam?.lesion_present === "no" ? "not_applicable" : "not_recorded");
  return { photo, face: c.clinical_photo_face?.status ?? "not_recorded" };
}

/** Records the participant's clinical-photography decision (granted or declined) with policy version and language. */
export async function recordClinicalPhotoConsent(
  staff: StaffSession,
  patientId: string,
  input: { decision: "granted" | "declined"; faceDecision?: "granted" | "declined"; language?: string },
  correlationId: string,
) {
  assertClinicalImagesEnabled();
  requirePermission(staff, "clinical_image.capture");
  const d = await db();
  return d.tx(async (q) => {
    const p = await loadPatientForStaff(q, patientId, staff, correlationId, true);
    if (p.status === "withdrawn") throw Errors.gated("This participant has withdrawn.");
    const language = input.language && (LANGUAGE_CODES as readonly string[]).includes(input.language) ? input.language : p.preferred_language;
    const write = async (type: ConsentType, status: "granted" | "declined") => {
      const policy = CONSENT_POLICIES[type];
      await q.query(
        `insert into consents (patient_id, consent_type, status, policy_version, policy_text_sha256, language, actor_type, actor_user_id)
         values ($1, $2, $3, $4, $5, $6, 'staff', $7)`,
        [patientId, type, status, policy.version, sha256(policy.text), language, staff.userId],
      );
      await audit({ actorType: "staff", actorId: staff.userId, action: `consent.${type}`, targetType: "patient", targetRef: patientId, outcome: "success", correlationId, code: status }, q);
    };
    await write("clinical_photo", input.decision);
    // Face consent is only asked when photography itself is consented to.
    await write("clinical_photo_face", input.decision === "granted" && input.faceDecision === "granted" ? "granted" : "declined");
    return clinicalPhotoStatus(q, patientId);
  });
}

export type LesionImageMeta = {
  id: string; examRecordId: string; examVersion: number; lesionSite: string; lesionSiteLabel: string; includesFace: boolean; mime: string; bytes: number;
  width: number; height: number; capturedAt: string; capturedBy: string; replacesId: string | null; examStatus: "draft" | "verified";
};

export async function listLesionImages(staff: StaffSession, patientId: string, correlationId: string) {
  assertClinicalImagesEnabled();
  requirePermission(staff, "clinical_image.view");
  const d = await db();
  await loadPatientForStaff(d, patientId, staff, correlationId);
  const rows = (await d.query<{
    id: string; exam_record_id: string; version: number; exam_status: "draft" | "verified"; lesion_site: string; includes_face: boolean; mime: string; bytes: number;
    width: number; height: number; captured_at: string; captured_by_name: string; replaces_id: string | null; visible: boolean;
  }>(
    `select li.id, li.exam_record_id, e.version, e.status as exam_status, li.lesion_site, li.includes_face, li.mime, li.bytes, li.width, li.height,
            li.captured_at, u.display_name as captured_by_name, li.replaces_id, (${VISIBLE}) as visible
       from lesion_images li join exam_records e on e.id = li.exam_record_id join users u on u.id = li.captured_by
      where li.patient_id = $1 and li.deleted_at is null order by li.captured_at desc`, [patientId])).rows;
  const status = await clinicalPhotoStatus(d, patientId);
  const exam = await latestExam(d, patientId);
  const images: LesionImageMeta[] = rows.filter((r) => r.visible).map((r) => ({
    id: r.id, examRecordId: r.exam_record_id, examVersion: r.version, lesionSite: r.lesion_site, lesionSiteLabel: siteLabel(r.lesion_site), includesFace: r.includes_face,
    mime: r.mime, bytes: r.bytes, width: r.width, height: r.height, capturedAt: r.captured_at, capturedBy: r.captured_by_name, replacesId: r.replaces_id, examStatus: r.exam_status,
  }));
  return {
    status,
    images,
    // Hidden after withdrawal (retention per the approved policy, ADR-16).
    hiddenAfterWithdrawal: rows.length - images.length,
    canCapture: status.photo === "granted" && exam?.status === "draft" && (exam.lesion_present === "yes" || exam.lesion_present === "uncertain"),
    latestExam: exam ? { id: exam.id, version: exam.version, status: exam.status, lesionPresent: exam.lesion_present, lesionSites: exam.lesion_sites } : null,
  };
}

type UploadOpts = { examId: string; lesionSite: string; includesFace: boolean; replacesId?: string; idempotencyKey: string };

/** Workflow + consent gate. Run before processing and again inside the write transaction. */
async function assertCanCapture(q: Queryable, patientId: string, opts: UploadOpts) {
  const exam = await latestExam(q, patientId);
  if (!exam || exam.id !== opts.examId) throw Errors.gated("Images can only be added to the participant's latest examination.");
  if (exam.status !== "draft") throw Errors.gated("This examination is verified. Record a correction to add new images.");
  if (exam.lesion_present !== "yes" && exam.lesion_present !== "uncertain") throw Errors.gated("Record a lesion or affected area in the examination before adding images.");
  if (exam.lesion_sites.length && !exam.lesion_sites.includes(opts.lesionSite)) throw Errors.validation({ lesionSite: "Choose a lesion site recorded in this examination" });
  const consents = await currentConsents(q, patientId);
  if (consents.clinical_photo?.status !== "granted") throw Errors.gated("Clinical photography consent has not been given. Complete the examination without images.");
  if (opts.includesFace && consents.clinical_photo_face?.status !== "granted") throw Errors.gated("The participant has not consented to photographs that include their face.");
  return { exam, consents };
}

async function replayOf(patientId: string, key: string) {
  const d = await db();
  const prior = (await d.query<{ id: string; patient_id: string }>("select id, patient_id from lesion_images where idempotency_key = $1", [key])).rows[0];
  if (!prior) return null;
  if (prior.patient_id !== patientId) throw Errors.conflict("Duplicate upload key.", "idempotency_conflict");
  return { id: prior.id, replayed: true as const };
}

/**
 * Stores a clinical image. Order: feature flag → role → patient scope → idempotency → workflow
 * and consent → content validation → private storage → (transaction: lock patient, re-check
 * workflow/consent/replacement, insert metadata, audit).
 */
export async function uploadLesionImage(staff: StaffSession, patientId: string, opts: UploadOpts, upload: Buffer, correlationId: string) {
  assertClinicalImagesEnabled();
  requirePermission(staff, "clinical_image.capture");
  const d = await db();
  const p = await loadPatientForStaff(d, patientId, staff, correlationId);
  const replay = await replayOf(patientId, opts.idempotencyKey);
  if (replay) return replay;
  if (p.status === "withdrawn") throw Errors.gated("This participant has withdrawn.");
  await assertCanCapture(d, patientId, opts);
  if (opts.replacesId) {
    const old = (await d.query<{ id: string }>("select id from lesion_images where id = $1 and patient_id = $2 and exam_record_id = $3 and deleted_at is null", [opts.replacesId, patientId, opts.examId])).rows[0];
    if (!old) throw Errors.notFound();
  }

  const img = await processClinicalImage(upload);
  const imageId = crypto.randomUUID();
  const objectKey = `lesions/${patientId}/${imageId}.${img.ext}`;
  const previewKey = `lesions/${patientId}/${imageId}-preview.webp`;
  const store = objectStore("clinical");
  try {
    await store.put(objectKey, img.original, img.mime);
    await store.put(previewKey, img.preview, "image/webp");
  } catch {
    await Promise.allSettled([store.delete(objectKey), store.delete(previewKey)]);
    await audit({ actorType: "staff", actorId: staff.userId, action: "lesion_image.capture", targetType: "patient", targetRef: patientId, outcome: "failure", correlationId, code: "storage_unavailable" });
    throw new AppError(503, "storage_unavailable", "The image could not be saved right now. Nothing was stored — please try again.", undefined, 5);
  }

  const replacedKeys: string[] = [];
  try {
    await d.tx(async (q) => {
      await q.query("select id from patients where id = $1 for update", [patientId]);
      // Re-check under the lock: the exam may have been verified, or consent withdrawn,
      // while the image was being validated and stored.
      const { exam, consents } = await assertCanCapture(q, patientId, opts);
      if (opts.replacesId) {
        const r = (await q.query<{ object_key: string; preview_key: string }>(
          `update lesion_images set deleted_at = now(), deleted_by = $2, delete_reason = 'replaced'
            where id = $1 and patient_id = $3 and exam_record_id = $4 and deleted_at is null returning object_key, preview_key`,
          [opts.replacesId, staff.userId, patientId, exam.id])).rows[0];
        if (!r) throw Errors.conflict("That image was already replaced or deleted. Refresh and try again.", "replace_conflict");
        replacedKeys.push(r.object_key, r.preview_key);
      }
      await q.query(
        `insert into lesion_images (id, patient_id, exam_record_id, lesion_site, consent_id, includes_face, face_consent_id, storage_driver, object_key, preview_key,
                                    mime, bytes, width, height, sha256, metadata_removed, captured_by, idempotency_key, replaces_id)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19)`,
        [imageId, patientId, exam.id, opts.lesionSite, consents.clinical_photo!.id, opts.includesFace, opts.includesFace ? consents.clinical_photo_face!.id : null,
          store.driver, objectKey, previewKey, img.mime, img.original.length, img.width, img.height, img.sha256, img.removed, staff.userId, opts.idempotencyKey, opts.replacesId ?? null],
      );
      await audit({ actorType: "staff", actorId: staff.userId, action: opts.replacesId ? "lesion_image.replace" : "lesion_image.capture", targetType: "patient", targetRef: patientId, outcome: "success", correlationId, details: { imageId, site: opts.lesionSite, examVersion: exam.version, bytes: img.original.length } }, q);
    });
  } catch (e) {
    await Promise.allSettled([store.delete(objectKey), store.delete(previewKey)]);
    // A concurrent retry with the same idempotency key won the race: return its result.
    if ((e as { code?: string }).code === "23505") {
      const winner = await replayOf(patientId, opts.idempotencyKey);
      if (winner) return winner;
    }
    throw e;
  }
  await Promise.allSettled(replacedKeys.map((k) => store.delete(k)));
  return { id: imageId, replayed: false, width: img.width, height: img.height, metadataRemoved: img.removed };
}

type ImageRow = { id: string; patient_id: string; camp_id: string | null; object_key: string; preview_key: string; mime: string; lesion_site: string; captured_at: string | Date; exam_status: string; visible: boolean };

async function loadImageForStaff(staff: StaffSession, imageId: string, correlationId: string): Promise<ImageRow> {
  const d = await db();
  const r = (await d.query<ImageRow>(
    `select li.id, li.patient_id, p.camp_id, li.object_key, li.preview_key, li.mime, li.lesion_site, li.captured_at, e.status as exam_status, (${VISIBLE}) as visible
       from lesion_images li join patients p on p.id = li.patient_id join exam_records e on e.id = li.exam_record_id
      where li.id = $1 and li.deleted_at is null`, [imageId])).rows[0];
  // Missing, deleted and out-of-scope images all look the same (no cross-patient probing).
  if (!r || !inCampScope(staff.campScope, r.camp_id)) {
    await audit({ actorType: "staff", actorId: staff.userId, action: "lesion_image.access", targetType: "lesion_image", targetRef: imageId, outcome: "denied", correlationId, code: r ? "out_of_scope" : "not_found" });
    throw Errors.notFound();
  }
  if (!r.visible) throw Errors.gated("Photography consent for this image has been withdrawn; it is no longer available for viewing.");
  return r;
}

// Dedicated, domain-separated key for clinical image links.
let linkKey: string | undefined;
function linkSig(imageId: string, variant: LinkVariant, exp: number, tokenHash: string) {
  linkKey ??= hmac("derive:lesion-link-key:v1");
  return hmac(`lesion|${imageId}|${variant}|${exp}|${tokenHash}`, linkKey).slice(0, 40);
}

export function signLesionLink(imageId: string, variant: LinkVariant, tokenHash: string, now = Date.now()) {
  const exp = Math.floor(now / 1000) + LINK_TTL_SEC;
  return { url: `/api/lesion-images/${imageId}/content?v=${variant}&e=${exp}&s=${linkSig(imageId, variant, exp, tokenHash)}`, expiresAt: new Date(exp * 1000).toISOString() };
}

/**
 * Issues a short-lived link bound to the caller's session. Bytes are always served through the
 * app (also with S3), so every fetch re-checks session, role, scope and consent and is audited;
 * no bearer-style presigned URL ever leaves the server.
 */
export async function issueLesionLink(staff: StaffSession, imageId: string, variant: LinkVariant, correlationId: string) {
  assertClinicalImagesEnabled();
  requirePermission(staff, "clinical_image.view");
  const r = await loadImageForStaff(staff, imageId, correlationId);
  await audit({ actorType: "staff", actorId: staff.userId, action: variant === "download" ? "lesion_image.download" : "lesion_image.view", targetType: "patient", targetRef: r.patient_id, outcome: "success", correlationId, details: { imageId, variant, stage: "link_issued" } });
  return signLesionLink(imageId, variant, staff.tokenHash);
}

/**
 * Serves image bytes for a signed link. Requires: valid signature for THIS session, an unexpired
 * link, a still-active session with clinical-image permission, patient scope and current consent.
 */
export async function serveLesionContent(params: { imageId: string; variant: string | null; exp: string | null; sig: string | null; cookie: string | undefined }, correlationId: string) {
  assertClinicalImagesEnabled();
  const variant = (["view", "download", "preview"] as const).find((v) => v === params.variant);
  const exp = Number(params.exp);
  if (!variant || !params.sig || !params.cookie || params.cookie.length > 128 || !Number.isInteger(exp)) throw new AppError(403, "invalid_link", "This image link is invalid.");
  if (!safeEqual(params.sig, linkSig(params.imageId, variant, exp, hashToken(params.cookie)))) {
    await audit({ actorType: "anonymous", action: "lesion_image.access", targetType: "lesion_image", targetRef: params.imageId, outcome: "denied", correlationId, code: "bad_signature" });
    throw new AppError(403, "invalid_link", "This image link is invalid.");
  }
  if (exp * 1000 < Date.now()) throw new AppError(403, "link_expired", "This image link has expired. Open the image again from the participant record.");
  const staff = await readStaffSession(params.cookie);
  if (!staff || !staff.mfaVerified) throw Errors.unauthenticated();
  if (!can(staff.role, "clinical_image.view")) throw Errors.forbidden();
  const r = await loadImageForStaff(staff, params.imageId, correlationId);
  const key = variant === "preview" ? r.preview_key : r.object_key;
  const obj = await objectStore("clinical").get(key);
  if (!obj) throw new AppError(503, "storage_unavailable", "The image is temporarily unavailable. Please try again.");
  await audit({ actorType: "staff", actorId: staff.userId, action: variant === "download" ? "lesion_image.download" : "lesion_image.view", targetType: "patient", targetRef: r.patient_id, outcome: "success", correlationId, details: { imageId: r.id, variant, stage: "content_served" } });
  const ext = key.split(".").pop();
  return {
    data: obj.data,
    contentType: variant === "preview" ? "image/webp" : r.mime,
    disposition: variant === "download" ? `attachment; filename="lesion-${r.lesion_site}-${new Date(r.captured_at).toISOString().slice(0, 10)}.${ext}"` : "inline",
  };
}

/** Deletes an image from a draft examination (verified records are immutable). */
export async function deleteLesionImage(staff: StaffSession, imageId: string, reason: string, correlationId: string) {
  assertClinicalImagesEnabled();
  requirePermission(staff, "clinical_image.delete");
  const d = await db();
  const r = (await d.query<{ patient_id: string; camp_id: string | null }>(
    "select li.patient_id, p.camp_id from lesion_images li join patients p on p.id = li.patient_id where li.id = $1 and li.deleted_at is null", [imageId])).rows[0];
  if (!r || !inCampScope(staff.campScope, r.camp_id)) throw Errors.notFound();
  const keys = await d.tx(async (q) => {
    await q.query("select id from patients where id = $1 for update", [r.patient_id]); // serialises with verifyExam
    const row = (await q.query<{ object_key: string; preview_key: string }>(
      `update lesion_images li set deleted_at = now(), deleted_by = $2, delete_reason = $3
        where li.id = $1 and li.deleted_at is null
          and exists (select 1 from exam_records e where e.id = li.exam_record_id and e.status = 'draft')
        returning li.object_key, li.preview_key`, [imageId, staff.userId, reason])).rows[0];
    if (!row) throw Errors.gated("This image is on a verified examination (or was already removed) and cannot be deleted. Record a correction instead.");
    await audit({ actorType: "staff", actorId: staff.userId, action: "lesion_image.delete", targetType: "patient", targetRef: r.patient_id, outcome: "success", correlationId, details: { imageId } }, q);
    return [row.object_key, row.preview_key];
  });
  const store = objectStore("clinical");
  await Promise.allSettled(keys.map((k) => store.delete(k)));
  return { ok: true };
}
