import "server-only";
import crypto from "node:crypto";
import { db } from "../db";
import { Errors } from "../errors";
import { audit } from "../audit";
import { inCampScope } from "../authz";
import { processPhoto } from "../images";
import { objectStore } from "../storage";
import type { StaffSession } from "../security/session";
import { hasConsent } from "./common";
import { hmac, safeEqual } from "../security/crypto";

// ---- Signed thumbnail URLs ----------------------------------------------------------------
// Record lists are authorised and audited once; each thumbnail then carries an HMAC over
// (photo, patient, expiry, session-token hash). Serving a thumbnail needs no database work —
// the request must still present the same session cookie, and the link expires within 20 min.
// Expiry is bucketed to 10-minute windows so URLs stay stable and browser caching keeps working.
const THUMB_WINDOW_SEC = 600;

function thumbSig(photoId: string, patientId: string, exp: number, tokenHash: string) {
  return hmac(`thumb|${photoId}|${patientId}|${exp}|${tokenHash}`).slice(0, 32);
}

export function signedThumbUrl(photoId: string, patientId: string, tokenHash: string, now = Date.now()): string {
  const exp = (Math.floor(now / 1000 / THUMB_WINDOW_SEC) + 2) * THUMB_WINDOW_SEC;
  return `/api/photos/${photoId}?v=thumb&p=${patientId}&e=${exp}&s=${thumbSig(photoId, patientId, exp, tokenHash)}`;
}

export function verifyThumbSignature(photoId: string, patientId: string, exp: number, sig: string, tokenHash: string, now = Date.now()): boolean {
  if (!Number.isInteger(exp) || exp * 1000 < now || exp * 1000 > now + 3 * THUMB_WINDOW_SEC * 1000) return false;
  return safeEqual(sig, thumbSig(photoId, patientId, exp, tokenHash));
}

/** Fast path for signed thumbnails: storage read (or S3 presigned redirect) only. */
export async function serveSignedThumb(photoId: string, patientId: string): Promise<PhotoAccess | null> {
  const key = `photos/${patientId}/${photoId}-thumb.webp`;
  const store = objectStore();
  if (store.signedUrl) return { kind: "redirect", url: await store.signedUrl(key, 300) };
  const obj = await store.get(key);
  return obj ? { kind: "bytes", data: obj.data, etag: `"${photoId}-thumb"` } : null;
}

export type PhotoMeta = { id: string; patientId: string; width: number; height: number; bytes: number; thumbBytes: number; createdAt: string };

type Actor = { type: "participant" } | { type: "staff"; staff: StaffSession };

/**
 * Stores a participant identity photo. Flow: consent check → re-encode off the request
 * thread with bounded concurrency → write bytes to private object storage under random
 * keys → record metadata in Postgres in a transaction that supersedes the previous photo.
 * Retries with the same idempotency key return the original photo (no duplicates).
 */
export async function savePatientPhoto(patientId: string, upload: Buffer, idempotencyKey: string, actor: Actor, correlationId: string): Promise<PhotoMeta & { replayed: boolean }> {
  const d = await db();
  const prior = (await d.query<{ id: string; patient_id: string; width: number; height: number; bytes: number; thumb_bytes: number; created_at: string }>(
    "select id, patient_id, width, height, bytes, thumb_bytes, created_at from patient_photos where idempotency_key = $1",
    [idempotencyKey],
  )).rows[0];
  if (prior) {
    if (prior.patient_id !== patientId) throw Errors.conflict("Duplicate upload key.", "idempotency_conflict");
    return { id: prior.id, patientId, width: prior.width, height: prior.height, bytes: prior.bytes, thumbBytes: prior.thumb_bytes, createdAt: prior.created_at, replayed: true };
  }

  const p = (await d.query<{ status: string; camp_id: string | null }>("select status, camp_id from patients where id = $1", [patientId])).rows[0];
  if (!p || p.status === "withdrawn" || (actor.type === "staff" && !inCampScope(actor.staff.campScope, p.camp_id))) throw Errors.notFound();
  const consentId = await hasConsent(d, patientId, "photo");
  if (!consentId) throw Errors.gated("Photo consent has not been given for this participant.");

  const processed = await processPhoto(upload);
  const photoId = crypto.randomUUID();
  const objectKey = `photos/${patientId}/${photoId}.webp`;
  const thumbKey = `photos/${patientId}/${photoId}-thumb.webp`;
  const store = objectStore();
  await store.put(objectKey, processed.full, "image/webp");
  await store.put(thumbKey, processed.thumb, "image/webp");

  try {
    const row = await d.tx(async (q) => {
      await q.query("select id from patients where id = $1 for update", [patientId]);
      await q.query("update patient_photos set superseded_at = now() where patient_id = $1 and superseded_at is null", [patientId]);
      const r = (await q.query<{ created_at: string }>(
        `insert into patient_photos (id, patient_id, consent_id, storage_driver, object_key, thumb_key, mime, bytes, thumb_bytes, width, height, sha256,
                                     captured_by_type, captured_by_user, idempotency_key)
         values ($1,$2,$3,$4,$5,$6,'image/webp',$7,$8,$9,$10,$11,$12,$13,$14) returning created_at`,
        [photoId, patientId, consentId, store.driver, objectKey, thumbKey, processed.full.length, processed.thumb.length, processed.width, processed.height,
          processed.sha256, actor.type, actor.type === "staff" ? actor.staff.userId : null, idempotencyKey],
      )).rows[0]!;
      await audit({ actorType: actor.type === "staff" ? "staff" : "participant", actorId: actor.type === "staff" ? actor.staff.userId : null, action: "photo.capture", targetType: "patient", targetRef: patientId, outcome: "success", correlationId, details: { photoId, bytes: processed.full.length } }, q);
      return r;
    });
    return { id: photoId, patientId, width: processed.width, height: processed.height, bytes: processed.full.length, thumbBytes: processed.thumb.length, createdAt: row.created_at, replayed: false };
  } catch (e) {
    await Promise.all([store.delete(objectKey), store.delete(thumbKey)]).catch(() => {});
    // A concurrent retry with the same key won the race: return its result.
    if ((e as { code?: string }).code === "23505") {
      const winner = (await d.query<{ id: string; patient_id: string; width: number; height: number; bytes: number; thumb_bytes: number; created_at: string }>(
        "select id, patient_id, width, height, bytes, thumb_bytes, created_at from patient_photos where idempotency_key = $1",
        [idempotencyKey],
      )).rows[0];
      if (winner && winner.patient_id === patientId) {
        return { id: winner.id, patientId, width: winner.width, height: winner.height, bytes: winner.bytes, thumbBytes: winner.thumb_bytes, createdAt: winner.created_at, replayed: true };
      }
    }
    throw e;
  }
}

export type PhotoAccess =
  | { kind: "redirect"; url: string }
  | { kind: "bytes"; data: Buffer; etag: string };

/** Authorises and resolves a photo for serving. Superseded/withdrawn photos are never served. */
export async function resolvePhoto(photoId: string, variant: "thumb" | "full", who: { staff: StaffSession | null; intakePatientId: string | null }, ifNoneMatch: string | null, correlationId: string): Promise<PhotoAccess | "not-modified"> {
  const d = await db();
  const r = (await d.query<{ patient_id: string; object_key: string; thumb_key: string; sha256: string; camp_id: string | null }>(
    `select ph.patient_id, ph.object_key, ph.thumb_key, ph.sha256, p.camp_id from patient_photos ph join patients p on p.id = ph.patient_id
      where ph.id = $1 and ph.superseded_at is null and p.status <> 'withdrawn'`,
    [photoId],
  )).rows[0];
  const allowed = !!r && (who.staff ? inCampScope(who.staff.campScope, r.camp_id) : who.intakePatientId === r.patient_id);
  if (!r || !allowed) {
    await audit({ actorType: who.staff ? "staff" : "participant", actorId: who.staff?.userId ?? null, action: "photo.view", targetType: "photo", targetRef: photoId, outcome: "denied", correlationId });
    throw Errors.notFound();
  }
  // Thumbnails appear in record lists (the list view itself is audited); full views are audited individually.
  if (variant === "full" && who.staff) {
    await audit({ actorType: "staff", actorId: who.staff.userId, action: "photo.view", targetType: "patient", targetRef: r.patient_id, outcome: "success", correlationId, details: { photoId } });
  }
  const etag = `"${r.sha256.slice(0, 32)}-${variant}"`;
  if (ifNoneMatch === etag) return "not-modified";
  const key = variant === "thumb" ? r.thumb_key : r.object_key;
  const store = objectStore();
  if (store.signedUrl) return { kind: "redirect", url: await store.signedUrl(key, 300) };
  const obj = await store.get(key);
  if (!obj) throw Errors.notFound();
  return { kind: "bytes", data: obj.data, etag };
}
