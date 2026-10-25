import "server-only";
import { db } from "../db";
import { config } from "../config";
import { audit } from "../audit";
import { can } from "../authz";
import { hashToken } from "../security/crypto";
import type { StaffSession } from "../security/session";
import type { PatientStatus } from "@/lib/shared/constants";
import { currentConsents, decodeCursor, encodeCursor, loadPatientForStaff, type PatientRow } from "./common";
import { loadQuestionnaire } from "./questionnaire";
import { signedThumbUrl } from "./photos";

export type PatientListItem = {
  id: string;
  displayId: string;
  fullName: string;
  age: number;
  campId: string | null;
  campName: string | null;
  status: PatientStatus;
  groupCode: number | null;
  createdAt: string;
  photo: { id: string; thumbUrl: string; fullUrl: string } | null;
};

const photoUrls = (id: string, patientId: string, staff: StaffSession) => ({ id, thumbUrl: signedThumbUrl(id, patientId, staff.tokenHash), fullUrl: `/api/photos/${id}?v=full` });

/**
 * Staff record search/list with photos. Keyset pagination keeps every page O(page size) even
 * with very large tables; photo thumbnails are referenced by URL and lazy-loaded by the
 * browser, so the list query never moves image bytes.
 */
export async function searchPatients(
  staff: StaffSession,
  params: { q?: string; campId?: string; status?: PatientStatus; cursor?: string; limit: number },
  correlationId: string,
): Promise<{ items: PatientListItem[]; nextCursor: string | null; matchedBy: string }> {
  const d = await db();
  const where: string[] = [];
  const args: unknown[] = [];
  const add = (clause: string, ...vals: unknown[]) => {
    let c = clause;
    for (const v of vals) {
      args.push(v);
      c = c.replace("?", `$${args.length}`);
    }
    where.push(c);
  };

  let matchedBy = "list";
  const q = params.q?.trim();
  if (q) {
    const prefix = config().PARTICIPANT_ID_PREFIX;
    if (new RegExp(`^${prefix}-\\d{1,8}$`, "i").test(q)) {
      matchedBy = "id";
      add("p.display_id = ?", q.toUpperCase());
    } else if (/^[6-9]\d{9}$/.test(q)) {
      matchedBy = "mobile";
      add("p.mobile = ?", q);
    } else if (/^[A-Za-z0-9_-]{43}$/.test(q)) {
      matchedBy = "qr";
      add("p.id = (select patient_id from intake_tokens where token_hash = ? and kind = 'qr' and revoked_at is null)", hashToken(q));
    } else if (q.length >= 2) {
      matchedBy = "name";
      add("lower(p.full_name) = lower(?)", q);
    } else {
      return { items: [], nextCursor: null, matchedBy: "none" };
    }
  }
  if (params.campId) add("p.camp_id = ?", params.campId);
  if (params.status) add("p.status = ?", params.status);
  if (staff.campScope) add("p.camp_id = any(?::uuid[])", staff.campScope);
  const cur = decodeCursor(params.cursor);
  if (cur) add("(p.created_at, p.id) < (?::timestamptz, ?::uuid)", cur.createdAt, cur.id);

  args.push(params.limit + 1);
  const rows = (await d.query<{
    id: string; display_id: string; full_name: string; age: number; camp_id: string | null; camp_name: string | null; status: PatientStatus;
    group_code: number | null; created_at: string; photo_id: string | null;
  }>(
    `select p.id, p.display_id, p.full_name, p.age, p.camp_id, c.name as camp_name, p.status, p.group_code, p.created_at, ph.id as photo_id
       from patients p
       left join camps c on c.id = p.camp_id
       left join lateral (select id from patient_photos where patient_id = p.id and superseded_at is null order by created_at desc limit 1) ph on true
      ${where.length ? "where " + where.join(" and ") : ""}
      order by p.created_at desc, p.id desc
      limit $${args.length}`,
    args,
  )).rows;

  const page = rows.slice(0, params.limit);
  const last = page[page.length - 1];
  await audit({ actorType: "staff", actorId: staff.userId, action: "patient.search", outcome: "success", correlationId, code: matchedBy, details: { results: page.length } });
  return {
    items: page.map((r) => ({
      id: r.id, displayId: r.display_id, fullName: r.full_name, age: r.age, campId: r.camp_id, campName: r.camp_name, status: r.status,
      groupCode: r.group_code, createdAt: r.created_at, photo: r.photo_id ? photoUrls(r.photo_id, r.id, staff) : null,
    })),
    nextCursor: rows.length > params.limit && last ? encodeCursor(last.created_at, last.id) : null,
    matchedBy,
  };
}

export type TimelineEvent = { at: string; kind: string; label: string; by?: string | null };

export async function patientDetail(staff: StaffSession, patientId: string, correlationId: string) {
  const d = await db();
  const p: PatientRow = await loadPatientForStaff(d, patientId, staff, correlationId);
  const [consents, questionnaire, photos, exams, classification, reports, followUps, checkins, camp, whatsapp] = await Promise.all([
    currentConsents(d, patientId),
    loadQuestionnaire(patientId),
    d.query<{ id: string; created_at: string; superseded_at: string | null; captured_by_type: string; width: number; height: number }>(
      "select id, created_at, superseded_at, captured_by_type, width, height from patient_photos where patient_id = $1 order by created_at desc limit 10", [patientId]),
    d.query<Record<string, unknown>>(
      `select e.*, ru.display_name as recorded_by_name, vu.display_name as verified_by_name from exam_records e
         join users ru on ru.id = e.recorded_by left join users vu on vu.id = e.verified_by
        where e.patient_id = $1 order by e.version desc`, [patientId]),
    d.query<Record<string, unknown>>("select * from classifications where patient_id = $1 order by computed_at desc limit 1", [patientId]),
    d.query<{ id: string; version: number; created_at: string }>("select id, version, created_at from reports where patient_id = $1 order by version desc", [patientId]),
    d.query<Record<string, unknown>>("select * from follow_up_events where patient_id = $1 order by created_at desc", [patientId]),
    d.query<{ created_at: string; camp_name: string | null }>("select k.created_at, c.name as camp_name from checkins k left join camps c on c.id = k.camp_id where k.patient_id = $1", [patientId]),
    p.camp_id ? d.query<{ name: string; code: string }>("select name, code from camps where id = $1", [p.camp_id]) : Promise.resolve({ rows: [] }),
    d.query<{ status: string; created_at: string }>("select status, created_at from whatsapp_messages where patient_id = $1 order by created_at desc", [patientId]),
  ]);

  // Lesion-image events appear only for roles allowed to see clinical images (not Super Admin).
  const lesionRows = can(staff.role, "clinical_image.view")
    ? (await d.query<{ captured_at: string; lesion_site: string; deleted_at: string | null }>(
        "select captured_at, lesion_site, deleted_at from lesion_images where patient_id = $1 order by captured_at", [patientId])).rows
    : [];
  const consentRows = (await d.query<{ consent_type: string; status: string; created_at: string; actor_type: string }>(
    "select consent_type, status, created_at, actor_type from consents where patient_id = $1 order by created_at", [patientId])).rows;

  const timeline: TimelineEvent[] = [
    { at: p.created_at, kind: "registration", label: `Registered (${p.created_via === "self" ? "self-service" : "camp-assisted"})` },
    ...consentRows.map((c) => ({ at: c.created_at, kind: "consent", label: `Consent ${c.status}: ${c.consent_type.replace("_", " ")}` })),
    ...(questionnaire.completedAt ? [{ at: questionnaire.completedAt, kind: "questionnaire", label: `Questionnaire completed (protocol ${questionnaire.protocolVersion})` }] : []),
    ...photos.rows.map((ph) => ({ at: ph.created_at, kind: "photo", label: `Photo captured by ${ph.captured_by_type}${ph.superseded_at ? " (replaced)" : ""}` })),
    ...checkins.rows.map((k) => ({ at: k.created_at, kind: "checkin", label: `Checked in${k.camp_name ? ` at ${k.camp_name}` : ""}` })),
    ...exams.rows.flatMap((e) => [
      { at: String(e.recorded_at), kind: "exam", label: `Examination v${e.version} recorded`, by: e.recorded_by_name as string },
      ...(e.verified_at ? [{ at: String(e.verified_at), kind: "verify", label: `Examination v${e.version} verified`, by: e.verified_by_name as string }] : []),
    ]),
    ...classification.rows.map((c) => ({ at: String(c.computed_at), kind: "classification", label: `Classified: Group ${c.group_code}` })),
    ...reports.rows.map((r) => ({ at: r.created_at, kind: "report", label: `Report v${r.version} generated` })),
    ...followUps.rows.map((f) => ({ at: String(f.created_at), kind: "followup", label: `Follow-up recorded (referral: ${String(f.referral_required).replace("_", " ")})` })),
    ...whatsapp.rows.map((w) => ({ at: w.created_at, kind: "whatsapp", label: `WhatsApp report ${w.status}` })),
    ...lesionRows.map((l) => ({ at: l.captured_at, kind: "lesion_image", label: `Clinical image captured (${l.lesion_site.replace(/_/g, " ")})${l.deleted_at ? " — later removed" : ""}` })),
  ].sort((a, b) => Date.parse(b.at) - Date.parse(a.at));

  await audit({ actorType: "staff", actorId: staff.userId, action: "patient.view", targetType: "patient", targetRef: patientId, outcome: "success", correlationId });
  const currentPhoto = photos.rows.find((ph) => !ph.superseded_at);
  return {
    patient: {
      id: p.id, displayId: p.display_id, fullName: p.full_name, age: p.age, mobile: p.mobile, driverType: p.driver_type, workingArea: p.working_area,
      campId: p.camp_id, campName: camp.rows[0]?.name ?? null, recruitmentSource: p.recruitment_source, contactPreference: p.contact_preference,
      language: p.preferred_language, status: p.status, habitPresent: p.habit_present, groupCode: p.group_code, pathway: p.pathway, createdAt: p.created_at,
      createdVia: p.created_via,
    },
    photo: currentPhoto ? photoUrls(currentPhoto.id, p.id, staff) : null,
    consents: Object.fromEntries(Object.entries(consents).map(([k, v]) => [k, v?.status ?? "not_given"])),
    questionnaire,
    exams: exams.rows,
    classification: classification.rows[0] ?? null,
    reports: reports.rows,
    followUps: followUps.rows,
    checkedIn: checkins.rows.length > 0,
    timeline,
  };
}
