import "server-only";
import type { Queryable } from "../db";
import { Errors } from "../errors";
import { inCampScope } from "../authz";
import { audit } from "../audit";
import type { StaffSession } from "../security/session";
import { PATIENT_STATUSES, type ConsentType, type PatientStatus } from "@/lib/shared/constants";

export type PatientRow = {
  id: string;
  display_id: string;
  full_name: string;
  age: number;
  mobile: string | null;
  driver_type: string;
  working_area: string | null;
  camp_id: string | null;
  recruitment_source: string;
  contact_preference: string;
  preferred_language: string;
  status: PatientStatus;
  habit_present: boolean | null;
  questionnaire_completed_at: string | null;
  group_code: number | null;
  pathway: string | null;
  classified_at: string | null;
  created_via: string;
  screening_mode: "in_person" | "virtual";
  created_at: string;
};

/**
 * Loads a patient for a staff member, enforcing object-level scope. Missing and out-of-scope
 * records give the same 404 so identifiers cannot be probed (IDOR/BOLA protection).
 */
export async function loadPatientForStaff(q: Queryable, patientId: string, staff: StaffSession, correlationId: string, forUpdate = false): Promise<PatientRow> {
  const r = await q.query<PatientRow>(`select * from patients where id = $1 ${forUpdate ? "for update" : ""}`, [patientId]);
  const p = r.rows[0];
  if (!p || !inCampScope(staff.campScope, p.camp_id)) {
    await audit({ actorType: "staff", actorId: staff.userId, action: "patient.access", targetType: "patient", targetRef: patientId, outcome: "denied", correlationId, code: p ? "out_of_scope" : "not_found" }, q);
    throw Errors.notFound();
  }
  return p;
}

export async function currentConsents(q: Queryable, patientId: string): Promise<Record<ConsentType, { status: "granted" | "withdrawn" | "declined"; id: string; at: string } | undefined>> {
  const r = await q.query<{ consent_type: ConsentType; status: "granted" | "withdrawn" | "declined"; id: string; created_at: string }>(
    `select distinct on (consent_type) consent_type, status, id, created_at from consents
      where patient_id = $1 order by consent_type, created_at desc, id desc`,
    [patientId],
  );
  const out = {} as Record<ConsentType, { status: "granted" | "withdrawn" | "declined"; id: string; at: string } | undefined>;
  for (const row of r.rows) out[row.consent_type] = { status: row.status, id: row.id, at: row.created_at };
  return out;
}

export async function hasConsent(q: Queryable, patientId: string, type: ConsentType): Promise<string | null> {
  const c = (await currentConsents(q, patientId))[type];
  return c?.status === "granted" ? c.id : null;
}

/** Moves status forward only (withdrawn is terminal); callers that must step back set it explicitly. */
export function advanceStatus(current: PatientStatus, target: PatientStatus): PatientStatus {
  if (current === "withdrawn") return current;
  return PATIENT_STATUSES.indexOf(target) > PATIENT_STATUSES.indexOf(current) ? target : current;
}

export function encodeCursor(createdAt: string, id: string) {
  return Buffer.from(`${new Date(createdAt).toISOString()}|${id}`).toString("base64url");
}
export function decodeCursor(c: string | undefined): { createdAt: string; id: string } | null {
  if (!c) return null;
  const [createdAt, id] = Buffer.from(c, "base64url").toString("utf8").split("|");
  if (!createdAt || !id || isNaN(Date.parse(createdAt)) || !/^[0-9a-f-]{36}$/.test(id)) throw Errors.badRequest("Invalid cursor.");
  return { createdAt, id };
}

export function ageBand(age: number): string {
  if (age < 25) return "<25";
  if (age < 35) return "25-34";
  if (age < 45) return "35-44";
  if (age < 55) return "45-54";
  return "55+";
}
