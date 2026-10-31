import "server-only";
import { db, type Queryable } from "../db";
import { config } from "../config";
import { AppError, Errors } from "../errors";
import { audit } from "../audit";
import { hashToken, randomToken, sha256 } from "../security/crypto";
import { createIntakeSession, type StaffSession } from "../security/session";
import type { RegistrationInput } from "../schemas";
import { CONSENT_POLICIES, STATUS_LABELS, type ConsentType } from "@/lib/shared/constants";
import { currentConsents, type PatientRow } from "./common";
import { inCampScope } from "../authz";

export const INTAKE_TOKEN_DAYS = 7;

type Actor = { type: "participant" } | { type: "staff"; staff: StaffSession };

export type RegistrationResult = {
  patientId: string;
  displayId: string;
  intakeToken: string;
  qrToken: string;
  replayed: boolean;
};

const CONSENT_MAP: [keyof RegistrationInput["consents"], ConsentType][] = [
  ["registration", "registration"],
  ["screening", "screening"],
  ["followupContact", "followup_contact"],
  ["whatsappReport", "whatsapp_report"],
  ["photo", "photo"],
  ["remoteImages", "remote_images"],
  ["reviewNotifications", "review_notifications"],
];

async function issueTokens(q: Queryable, patientId: string) {
  const intakeToken = randomToken();
  const qrToken = randomToken();
  await q.query("update intake_tokens set revoked_at = now() where patient_id = $1 and kind = 'intake' and revoked_at is null", [patientId]);
  await q.query(
    "insert into intake_tokens (patient_id, token_hash, kind, expires_at) values ($1, $2, 'intake', now() + make_interval(days => $3))",
    [patientId, hashToken(intakeToken), INTAKE_TOKEN_DAYS],
  );
  await q.query("update intake_tokens set revoked_at = now() where patient_id = $1 and kind = 'qr' and revoked_at is null", [patientId]);
  await q.query("insert into intake_tokens (patient_id, token_hash, kind, expires_at) values ($1, $2, 'qr', now() + interval '7 days')", [patientId, hashToken(qrToken)]);
  return { intakeToken, qrToken };
}

/**
 * Creates the participant, consent rows and tokens atomically (PRD §6.3). Replays with the
 * same idempotency key return the original record instead of creating a duplicate.
 */
export async function registerParticipant(input: Omit<RegistrationInput, "screeningMode"> & Partial<Pick<RegistrationInput, "screeningMode">>, actor: Actor, correlationId: string): Promise<RegistrationResult> {
  if (!config().INTAKE_ENABLED) throw Errors.disabled("Registration is not open yet. Please check back soon or contact the programme.");
  // With photo-based virtual screening switched on, virtual participants must agree to submit mouth photos.
  if (input.screeningMode === "virtual" && config().VIRTUAL_SCREENING_ENABLED && !input.consents.remoteImages) {
    throw Errors.validation({ "consents.remoteImages": "Consent to submit mouth photos is required for virtual screening" });
  }
  // The doctor's review reaches virtual participants only by message, so that consent is required too.
  if (input.screeningMode === "virtual" && config().VIRTUAL_SCREENING_ENABLED && !input.consents.reviewNotifications) {
    throw Errors.validation({ "consents.reviewNotifications": "Consent to receive review messages is required for virtual screening" });
  }
  if (input.consents.remoteImages && input.screeningMode !== "virtual") throw Errors.validation({ "consents.remoteImages": "This consent applies to virtual screening only" });
  const d = await db();
  return d.tx(async (q) => {
    const existing = (await q.query<{ id: string; display_id: string }>("select id, display_id from patients where idempotency_key = $1", [input.idempotencyKey])).rows[0];
    if (existing) {
      // A replay returns the ID only: it never issues tokens or a session, so a leaked
      // idempotency key cannot be used to take over someone's intake.
      return { patientId: existing.id, displayId: existing.display_id, intakeToken: "", qrToken: "", replayed: true };
    }

    if (input.campId) {
      const camp = (await q.query<{ status: string }>("select status from camps where id = $1", [input.campId])).rows[0];
      if (!camp || !["planned", "active"].includes(camp.status)) throw Errors.validation({ campId: "Choose an open camp" });
      if (actor.type === "staff" && actor.staff.campScope && !actor.staff.campScope.includes(input.campId)) throw Errors.validation({ campId: "Choose a camp you are assigned to" });
    } else if (actor.type === "staff" && actor.staff.campScope) {
      throw Errors.validation({ campId: "Choose a camp you are assigned to" });
    }

    if (input.mobile) {
      const dup = (await q.query<{ display_id: string; camp_id: string | null }>(
        "select display_id, camp_id from patients where mobile = $1 and lower(full_name) = lower($2) and status <> 'withdrawn' limit 1",
        [input.mobile, input.fullName],
      )).rows[0];
      if (dup) {
        await audit({ actorType: actor.type === "staff" ? "staff" : "participant", actorId: actor.type === "staff" ? actor.staff.userId : null, action: "patient.register", outcome: "failure", correlationId, code: "duplicate_suspected" }, q);
        if (actor.type === "staff" && inCampScope(actor.staff.campScope, dup.camp_id)) throw Errors.conflict(`This person may already be registered as ${dup.display_id}. Open that record instead.`, "duplicate_suspected");
        if (actor.type === "staff") throw Errors.conflict("This person may already be registered at another camp. Ask a Super Admin to check.", "duplicate_suspected");
        throw Errors.conflict("We could not complete registration automatically. Please ask camp staff for help.", "duplicate_suspected");
      }
    }

    const seq = (await q.query<{ n: number }>("select nextval('participant_seq')::int as n")).rows[0]!.n;
    const displayId = `${config().PARTICIPANT_ID_PREFIX}-${String(seq).padStart(4, "0")}`;
    const staffId = actor.type === "staff" ? actor.staff.userId : null;
    const p = (
      await q.query<{ id: string }>(
        `insert into patients (display_id, full_name, age, mobile, driver_type, working_area, camp_id, recruitment_source, contact_preference,
                               preferred_language, created_via, created_by, idempotency_key, screening_mode,
                               district, mandal, pincode, address_line)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18) returning id`,
        [displayId, input.fullName, input.age, input.mobile ?? null, input.driverType, input.workingArea || null, input.campId ?? null,
          input.recruitmentSource, input.contactPreference, input.language, actor.type === "staff" ? "camp_assisted" : "self", staffId, input.idempotencyKey, input.screeningMode ?? "in_person",
          input.district ?? null, input.mandal ?? null, input.pincode ?? null, input.addressLine ?? null],
      )
    ).rows[0]!;

    if (input.screeningMode === "virtual") await q.query("insert into virtual_cases (patient_id) values ($1)", [p.id]);
    for (const [field, type] of CONSENT_MAP) {
      if (!input.consents[field]) continue;
      const policy = CONSENT_POLICIES[type];
      await q.query(
        `insert into consents (patient_id, consent_type, status, policy_version, policy_text_sha256, language, actor_type, actor_user_id)
         values ($1, $2, 'granted', $3, $4, $5, $6, $7)`,
        [p.id, type, policy.version, sha256(policy.text), input.language, actor.type === "staff" ? "staff" : "participant", staffId],
      );
    }
    const tokens = await issueTokens(q, p.id);
    await audit({
      actorType: actor.type === "staff" ? "staff" : "participant",
      actorId: staffId,
      action: "patient.register",
      targetType: "patient",
      targetRef: p.id,
      outcome: "success",
      correlationId,
      details: { via: actor.type === "staff" ? "camp_assisted" : "self", consents: CONSENT_MAP.filter(([f]) => input.consents[f]).map(([, t]) => t) },
    }, q);
    return { patientId: p.id, displayId, ...tokens, replayed: false };
  });
}

/** Exchanges a participant intake token (from their resume link) for a short intake session. */
export async function exchangeIntakeToken(token: string, correlationId: string) {
  const d = await db();
  return d.tx(async (q) => {
    const row = (
      await q.query<{ id: string; patient_id: string }>(
        `update intake_tokens t set use_count = use_count + 1
           from patients p
          where t.token_hash = $1 and t.kind = 'intake' and t.revoked_at is null and t.expires_at > now()
            and t.use_count < 50 and p.id = t.patient_id and p.status <> 'withdrawn'
          returning t.id, t.patient_id`,
        [hashToken(token)],
      )
    ).rows[0];
    if (!row) {
      await audit({ actorType: "anonymous", action: "intake.token_exchange", outcome: "denied", correlationId, code: "invalid_token" }, q);
      throw new AppError(401, "invalid_token", "This link is invalid or has expired. Ask camp staff for help.");
    }
    const session = await createIntakeSession(row.patient_id, q);
    await audit({ actorType: "participant", action: "intake.token_exchange", targetType: "patient", targetRef: row.patient_id, outcome: "success", correlationId }, q);
    return session;
  });
}

export async function participantStatus(patientId: string) {
  const d = await db();
  const p = (await d.query<PatientRow>("select * from patients where id = $1", [patientId])).rows[0];
  if (!p) throw Errors.notFound();
  const consents = await currentConsents(d, patientId);
  const photo = (await d.query<{ id: string }>("select id from patient_photos where patient_id = $1 and superseded_at is null order by created_at desc limit 1", [patientId])).rows[0];
  const sub = (await d.query<{ status: string }>("select status from questionnaire_submissions where patient_id = $1 order by started_at desc limit 1", [patientId])).rows[0];
  // Participant view: identity echo is limited to first name + ID; no risk group before verification.
  return {
    displayId: p.display_id,
    firstName: p.full_name.split(" ")[0],
    language: p.preferred_language,
    status: p.status,
    statusLabel: STATUS_LABELS[p.status],
    questionnaire: sub?.status ?? "not_started",
    photoCaptured: !!photo,
    photoId: photo?.id ?? null,
    photoConsent: consents.photo?.status === "granted",
    whatsappConsent: consents.whatsapp_report?.status === "granted",
    followupConsent: consents.followup_contact?.status === "granted",
    screeningMode: p.screening_mode,
    virtualStatus: p.screening_mode === "virtual" && config().VIRTUAL_SCREENING_ENABLED
      ? ((await d.query<{ status: string }>("select status from virtual_cases where patient_id = $1", [patientId])).rows[0]?.status ?? null)
      : null,
  };
}

/** Consent withdrawal (participant self-service or staff on request). Stops future optional use. */
export async function withdrawConsent(
  patientId: string,
  type: ConsentType,
  actor: { type: "participant"; intakeSessionId: string } | { type: "staff"; staff: StaffSession },
  correlationId: string,
) {
  const d = await db();
  const removedKeys: string[] = [];
  await d.tx(async (q) => {
    const consents = await currentConsents(q, patientId);
    if (consents[type]?.status !== "granted") throw Errors.conflict("That consent is not currently given.", "not_granted");
    const p = (await q.query<{ preferred_language: string; status: string }>("select preferred_language, status from patients where id = $1 for update", [patientId])).rows[0]!;
    const policy = CONSENT_POLICIES[type];
    await q.query(
      `insert into consents (patient_id, consent_type, status, policy_version, policy_text_sha256, language, actor_type, actor_user_id)
       values ($1, $2, 'withdrawn', $3, $4, $5, $6, $7)`,
      [patientId, type, policy.version, sha256(policy.text), p.preferred_language, actor.type, actor.type === "staff" ? actor.staff.userId : null],
    );
    if (type === "photo") {
      const photos = (await q.query<{ object_key: string; thumb_key: string }>("update patient_photos set superseded_at = now() where patient_id = $1 and superseded_at is null returning object_key, thumb_key", [patientId])).rows;
      for (const ph of photos) removedKeys.push(ph.object_key, ph.thumb_key);
    }
    if (type === "registration") {
      // Withdrawing from the programme withdraws every other optional consent and removes the photo.
      for (const [other, cur] of Object.entries(consents)) {
        if (other === "registration" || cur?.status !== "granted") continue;
        const op = CONSENT_POLICIES[other as ConsentType];
        await q.query(
          `insert into consents (patient_id, consent_type, status, policy_version, policy_text_sha256, language, actor_type, actor_user_id)
           values ($1, $2, 'withdrawn', $3, $4, $5, $6, $7)`,
          [patientId, other, op.version, sha256(op.text), p.preferred_language, actor.type, actor.type === "staff" ? actor.staff.userId : null],
        );
      }
      const photos = (await q.query<{ object_key: string; thumb_key: string }>("update patient_photos set superseded_at = now() where patient_id = $1 and superseded_at is null returning object_key, thumb_key", [patientId])).rows;
      for (const ph of photos) removedKeys.push(ph.object_key, ph.thumb_key);
      await q.query("update patients set status = 'withdrawn', updated_at = now() where id = $1", [patientId]);
      await q.query("update intake_tokens set revoked_at = now() where patient_id = $1 and revoked_at is null", [patientId]);
      await q.query("update intake_sessions set revoked_at = now() where patient_id = $1 and revoked_at is null", [patientId]);
    }
    await audit({ actorType: actor.type === "staff" ? "staff" : "participant", actorId: actor.type === "staff" ? actor.staff.userId : null, action: "consent.withdraw", targetType: "patient", targetRef: patientId, outcome: "success", correlationId, code: type }, q);
  });
  if (removedKeys.length) {
    // Photo consent withdrawn → delete the image bytes (metadata row retained for audit).
    const { objectStore } = await import("../storage");
    await Promise.all(removedKeys.map((k) => objectStore().delete(k).catch(() => {})));
  }
}
