import "server-only";
import { z } from "zod";
import { db, type Queryable } from "../db";
import { Errors } from "../errors";
import { audit } from "../audit";
import { whatsappConfigured } from "../config";
import type { StaffSession } from "../security/session";
import type { examSchema, followUpSchema } from "../schemas";
import { classify, CLASSIFICATION_BLOCK_MESSAGES } from "@/lib/shared/classification";
import { CLINICAL_IMPRESSIONS } from "@/lib/shared/constants";
import { advanceStatus, hasConsent, loadPatientForStaff } from "./common";

type ExamInput = z.infer<typeof examSchema>;
type FollowUpInput = z.infer<typeof followUpSchema>;

/** Every clinical step re-checks that the participant is active and screening consent is current. */
async function assertActiveConsented(q: Queryable, p: { id: string; status: string }) {
  if (p.status === "withdrawn") throw Errors.gated("This participant has withdrawn.");
  if (!(await hasConsent(q, p.id, "screening"))) throw Errors.gated("Screening consent is not in place.");
}

export async function checkIn(staff: StaffSession, patientId: string, correlationId: string) {
  const d = await db();
  return d.tx(async (q) => {
    const p = await loadPatientForStaff(q, patientId, staff, correlationId, true);
    if (p.status === "withdrawn") throw Errors.gated("This participant has withdrawn.");
    const r = await q.query<{ id: string }>(
      `insert into checkins (patient_id, camp_id, checked_in_by) values ($1, $2, $3)
       on conflict (patient_id, coalesce(camp_id, '00000000-0000-0000-0000-000000000000'::uuid)) do nothing returning id`,
      [patientId, p.camp_id, staff.userId],
    );
    await q.query("update patients set status = $2, updated_at = now() where id = $1", [patientId, advanceStatus(p.status, "checked_in")]);
    await audit({ actorType: "staff", actorId: staff.userId, action: "patient.checkin", targetType: "patient", targetRef: patientId, outcome: "success", correlationId, code: r.rows.length ? "new" : "already" }, q);
    return { alreadyCheckedIn: r.rows.length === 0 };
  });
}

/**
 * Records or updates an examination draft. Verified examinations are immutable (DB trigger
 * too); changing one requires a correction reason and creates a new superseding version.
 */
export async function recordExam(staff: StaffSession, patientId: string, input: ExamInput, correlationId: string) {
  const d = await db();
  return d.tx(async (q) => {
    const p = await loadPatientForStaff(q, patientId, staff, correlationId, true);
    if (p.status === "withdrawn") throw Errors.gated("This participant has withdrawn.");
    if (!(await hasConsent(q, patientId, "screening"))) throw Errors.gated("Screening consent is not in place.");

    const latest = (await q.query<{ id: string; version: number; status: string }>(
      "select id, version, status from exam_records where patient_id = $1 order by version desc limit 1", [patientId])).rows[0];
    const vals = [
      input.examCompleted, input.mouthOpening ?? null, input.interIncisorMm ?? null, input.oralFindings, input.lesionSites,
      input.lesionPresent ?? null, input.clinicalImpression ?? null, input.notes || null,
    ];
    let examId: string;
    let version: number;
    if (latest?.status === "draft") {
      await q.query(
        `update exam_records set exam_completed=$2, mouth_opening=$3, inter_incisor_mm=$4, oral_findings=$5, lesion_sites=$6, lesion_present=$7,
                clinical_impression=$8, notes=$9, recorded_by=$10, recorded_at=now() where id=$1`,
        [latest.id, ...vals, staff.userId],
      );
      examId = latest.id;
      version = latest.version;
    } else {
      if (latest?.status === "verified" && !input.correctionReason) {
        throw Errors.validation({ correctionReason: "This examination is verified. Give a reason to record a correction." });
      }
      version = (latest?.version ?? 0) + 1;
      examId = (await q.query<{ id: string }>(
        `insert into exam_records (patient_id, version, supersedes_id, status, exam_completed, mouth_opening, inter_incisor_mm, oral_findings, lesion_sites,
                                   lesion_present, clinical_impression, notes, correction_reason, recorded_by)
         values ($1,$2,$3,'draft',$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) returning id`,
        [patientId, version, latest?.id ?? null, ...vals, latest ? input.correctionReason : null, staff.userId],
      )).rows[0]!.id;
    }
    // A correction re-opens verification: clear any group until the new version is verified.
    if (latest?.status === "verified") {
      await q.query("update patients set status = 'exam_recorded', group_code = null, pathway = null, classified_at = null, updated_at = now() where id = $1", [patientId]);
    } else {
      await q.query("update patients set status = $2, updated_at = now() where id = $1", [patientId, advanceStatus(p.status, "exam_recorded")]);
    }
    await audit({ actorType: "staff", actorId: staff.userId, action: latest?.status === "verified" ? "exam.correct" : "exam.record", targetType: "patient", targetRef: patientId, outcome: "success", correlationId, details: { version } }, q);
    return { examId, version, status: "draft" as const };
  });
}

/** Clinician verification gate (FR-CLI-03). Classification runs only on verified, complete inputs. */
export async function verifyExam(staff: StaffSession, patientId: string, examId: string, correlationId: string) {
  const d = await db();
  return d.tx(async (q) => {
    const p = await loadPatientForStaff(q, patientId, staff, correlationId, true);
    await assertActiveConsented(q, p);
    const exam = (await q.query<{ id: string; status: string; version: number; exam_completed: string; lesion_present: "yes" | "no" | "uncertain" | null; clinical_impression: string | null }>(
      "select id, status, version, exam_completed, lesion_present, clinical_impression from exam_records where id = $1 and patient_id = $2", [examId, patientId])).rows[0];
    if (!exam) throw Errors.notFound();
    const latestVersion = (await q.query<{ v: number }>("select max(version)::int as v from exam_records where patient_id = $1", [patientId])).rows[0]!.v;
    if (exam.version !== latestVersion) throw Errors.gated("Only the latest examination version can be verified.");
    if (exam.status === "verified") throw Errors.conflict("This examination is already verified.", "already_verified");

    await q.query("update exam_records set status = 'verified', verified_by = $2, verified_at = now() where id = $1", [examId, staff.userId]);
    await audit({ actorType: "staff", actorId: staff.userId, action: "exam.verify", targetType: "patient", targetRef: patientId, outcome: "success", correlationId, details: { version: exam.version } }, q);

    const result = classify({
      questionnaireCompleted: !!p.questionnaire_completed_at,
      examCompleted: exam.exam_completed === "yes",
      examVerified: true,
      habitPresent: p.habit_present,
      lesionPresent: exam.lesion_present,
    });
    if (!result.ok) {
      await q.query("update patients set status = $2, updated_at = now() where id = $1", [patientId, advanceStatus(p.status, "verified")]);
      return { verified: true, classification: null, blockedReason: result.reason, message: CLASSIFICATION_BLOCK_MESSAGES[result.reason] };
    }
    await q.query(
      `insert into classifications (patient_id, exam_record_id, habit_present, lesion_present, group_code, pathway, clinical_impression, computed_by)
       values ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [patientId, examId, result.habitPresent, result.lesionPresent, result.group, result.pathway, exam.clinical_impression, staff.userId],
    );
    await q.query("update patients set group_code = $2, pathway = $3, classified_at = now(), status = $4, updated_at = now() where id = $1", [
      patientId, result.group, result.pathway, advanceStatus(p.status === "exam_recorded" ? p.status : p.status, "verified"),
    ]);
    await audit({ actorType: "staff", actorId: staff.userId, action: "classification.compute", targetType: "patient", targetRef: patientId, outcome: "success", correlationId, details: { group: result.group } }, q);
    return { verified: true, classification: { group: result.group, pathway: result.pathway }, blockedReason: null, message: null };
  });
}

const GUIDANCE: Record<number, string> = {
  1: "No habit and no lesion were found at this screening. Learn the warning signs, and see a doctor if a mouth ulcer, red or white patch, lump, or difficulty opening the mouth lasts more than 2 weeks.",
  2: "A finding in the mouth needs clinical evaluation. Please attend the referral advised by the programme clinician.",
  3: "No lesion was found today. Tobacco or areca-nut use increases risk: cessation support and a planned re-screening are recommended.",
  4: "A finding in the mouth needs clinical evaluation, and cessation support is recommended. Please attend the referral advised by the programme clinician.",
};
export const REPORT_DISCLAIMER =
  "This is a programme screening category, not a diagnosis of cancer. Only a specialist evaluation can confirm a diagnosis. Wording pending clinical-owner approval.";

/** Builds a report snapshot from verified data only (FR-OPS-03). */
export async function generateReport(staff: StaffSession, patientId: string, correlationId: string) {
  const d = await db();
  return d.tx(async (q) => {
    const p = await loadPatientForStaff(q, patientId, staff, correlationId, true);
    await assertActiveConsented(q, p);
    const latestExam = (await q.query<{ id: string; status: string; version: number; verified_at: string; clinical_impression: string | null; verified_by_name: string }>(
      `select e.id, e.status, e.version, e.verified_at, e.clinical_impression, u.display_name as verified_by_name
         from exam_records e left join users u on u.id = e.verified_by where e.patient_id = $1 order by e.version desc limit 1`, [patientId])).rows[0];
    if (!latestExam || latestExam.status !== "verified") throw Errors.gated("A verified examination is required before a report can be generated.");
    const cls = (await q.query<{ id: string; group_code: number; pathway: string }>("select id, group_code, pathway from classifications where exam_record_id = $1", [latestExam.id])).rows[0];
    if (!cls) throw Errors.gated("This examination has no screening category yet (questionnaire incomplete or lesion status uncertain).");
    const version = ((await q.query<{ v: number | null }>("select max(version)::int as v from reports where patient_id = $1", [patientId])).rows[0]!.v ?? 0) + 1;
    const snapshot = {
      displayId: p.display_id,
      name: p.full_name,
      age: p.age,
      examVersion: latestExam.version,
      verifiedAt: latestExam.verified_at,
      verifiedBy: latestExam.verified_by_name,
      group: cls.group_code,
      pathway: cls.pathway,
      impression: CLINICAL_IMPRESSIONS.find((c) => c.value === latestExam.clinical_impression)?.label ?? null,
      guidance: GUIDANCE[cls.group_code],
      disclaimer: REPORT_DISCLAIMER,
    };
    const r = (await q.query<{ id: string }>(
      "insert into reports (patient_id, classification_id, version, snapshot, generated_by) values ($1,$2,$3,$4::jsonb,$5) returning id",
      [patientId, cls.id, version, JSON.stringify(snapshot), staff.userId],
    )).rows[0]!;
    await q.query("update patients set status = $2, updated_at = now() where id = $1", [patientId, advanceStatus(p.status, "report_ready")]);
    await audit({ actorType: "staff", actorId: staff.userId, action: "report.generate", targetType: "patient", targetRef: patientId, outcome: "success", correlationId, details: { version } }, q);
    return { reportId: r.id, version };
  });
}

export async function readReport(staff: StaffSession, reportId: string, correlationId: string) {
  const d = await db();
  const r = (await d.query<{ id: string; patient_id: string; version: number; snapshot: unknown; created_at: string }>(
    "select id, patient_id, version, snapshot, created_at from reports where id = $1", [reportId])).rows[0];
  if (!r) throw Errors.notFound();
  await loadPatientForStaff(d, r.patient_id, staff, correlationId);
  await audit({ actorType: "staff", actorId: staff.userId, action: "report.view", targetType: "patient", targetRef: r.patient_id, outcome: "success", correlationId, details: { version: r.version } });
  return { ...r, snapshot: (typeof r.snapshot === "string" ? JSON.parse(r.snapshot) : r.snapshot) as Record<string, unknown> };
}

export async function recordFollowUp(staff: StaffSession, patientId: string, input: FollowUpInput, correlationId: string) {
  const d = await db();
  return d.tx(async (q) => {
    const p = await loadPatientForStaff(q, patientId, staff, correlationId, true);
    await assertActiveConsented(q, p);
    if (!p.classified_at) throw Errors.gated("Follow-up can be recorded after the screening category is assigned.");
    if (input.followUpRequired && !input.dueDate) throw Errors.validation({ dueDate: "Set a follow-up due date" });
    await q.query(
      `insert into follow_up_events (patient_id, referral_required, referral_destination, follow_up_required, due_date, contact_outcome, referral_outcome, cessation_outcome, created_by)
       values ($1,$2,$3,$4,$5::date,$6,$7,$8,$9)`,
      [patientId, input.referralRequired, input.referralDestination ?? null, input.followUpRequired, input.dueDate ?? null, input.contactOutcome ?? null,
        input.referralOutcome ?? null, input.cessationOutcome ?? null, staff.userId],
    );
    if (input.followUpRequired) await q.query("update patients set status = $2, updated_at = now() where id = $1", [patientId, advanceStatus(p.status, "follow_up_due")]);
    await audit({ actorType: "staff", actorId: staff.userId, action: "followup.record", targetType: "patient", targetRef: patientId, outcome: "success", correlationId, code: input.referralRequired }, q);
    return { ok: true };
  });
}

/**
 * WhatsApp report submission gate (FR-OPS-04/05). Every check must pass; the status recorded is
 * "submitted" — never "delivered" until a verified provider webhook says so.
 */
export async function submitWhatsAppReport(staff: StaffSession, patientId: string, reportId: string, idempotencyKey: string, correlationId: string) {
  const d = await db();
  return d.tx(async (q) => {
    const p = await loadPatientForStaff(q, patientId, staff, correlationId, true);
    await assertActiveConsented(q, p);
    const prior = (await q.query<{ status: string; report_id: string; patient_id: string }>("select status, report_id, patient_id from whatsapp_messages where idempotency_key = $1", [idempotencyKey])).rows[0];
    if (prior) {
      if (prior.patient_id !== patientId || prior.report_id !== reportId) throw Errors.conflict("Duplicate request key.", "idempotency_conflict");
      return { status: prior.status, replayed: true };
    }
    const report = (await q.query<{ id: string }>("select id from reports where id = $1 and patient_id = $2", [reportId, patientId])).rows[0];
    if (!report) throw Errors.notFound();
    const failures: string[] = [];
    // Only the latest report built from the current (latest, verified) examination may be sent.
    const current = (await q.query<{ id: string }>(
      `select r.id from reports r join classifications c on c.id = r.classification_id
        where r.patient_id = $1
          and c.exam_record_id = (select id from exam_records where patient_id = $1 order by version desc limit 1)
        order by r.version desc limit 1`, [patientId])).rows[0];
    if (current?.id !== reportId) failures.push("This report is not the latest report for the current verified examination.");
    if (!whatsappConfigured()) failures.push("WhatsApp integration is not configured.");
    if (!(await hasConsent(q, patientId, "whatsapp_report"))) failures.push("WhatsApp report consent is not current.");
    if (!(await hasConsent(q, patientId, "followup_contact"))) failures.push("Follow-up contact consent is not current.");
    if (!p.mobile || !/^[6-9]\d{9}$/.test(p.mobile)) failures.push("No valid Indian mobile number on record.");
    const sent = (await q.query<{ id: string }>("select id from whatsapp_messages where report_id = $1 and status <> 'failed'", [reportId])).rows[0];
    if (sent) failures.push("This report has already been submitted to WhatsApp.");
    if (failures.length) {
      await audit({ actorType: "staff", actorId: staff.userId, action: "whatsapp.submit", targetType: "patient", targetRef: patientId, outcome: "denied", correlationId, details: { checks: failures.length } }, q);
      throw Errors.gated(failures.join(" "));
    }
    // Provider call intentionally omitted until ADR-07 (templates, business account) is approved.
    await q.query(
      "insert into whatsapp_messages (patient_id, report_id, idempotency_key, status, created_by) values ($1, $2, $3, 'submitted', $4)",
      [patientId, reportId, idempotencyKey, staff.userId],
    );
    await audit({ actorType: "staff", actorId: staff.userId, action: "whatsapp.submit", targetType: "patient", targetRef: patientId, outcome: "success", correlationId }, q);
    return { status: "submitted", replayed: false };
  });
}
