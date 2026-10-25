import "server-only";
import { z } from "zod";
import { db } from "../db";
import { Errors } from "../errors";
import { audit } from "../audit";
import { hmac } from "../security/crypto";
import { revokeAllUserSessions, revokeSession, type StaffSession } from "../security/session";
import type { campSchema, createUserSchema, updateUserSchema } from "../schemas";
import { createResetToken, SETUP_LINK_MINUTES } from "./auth";
import { ageBand } from "./common";
import { config } from "../config";
import type { Role } from "@/lib/shared/constants";

// ---------- Staff accounts (Super Admin only; enforced by route permission + checks here) ----------

export async function listUsers() {
  const d = await db();
  return (await d.query<{ id: string; email: string; display_name: string; role: Role; status: string; mfa_enabled: boolean; camp_scope: string[] | null; created_at: string; last_active: string | null }>(
    `select u.id, u.email, u.display_name, u.role, u.status, u.mfa_enabled, u.camp_scope, u.created_at,
            (select max(last_active_at) from app_sessions s where s.user_id = u.id) as last_active
       from users u order by u.created_at`,
  )).rows;
}

/** Creates a pre-provisioned staff account. Returns a one-time setup link (password + MFA on first sign-in). */
export async function createUser(actor: StaffSession, input: z.infer<typeof createUserSchema>, correlationId: string) {
  const d = await db();
  const exists = (await d.query("select 1 from users where email = $1", [input.email])).rows.length > 0;
  if (exists) throw Errors.conflict("An account with this email already exists.", "duplicate_email");
  const u = (await d.query<{ id: string }>(
    "insert into users (email, display_name, role, camp_scope, created_by) values ($1, $2, $3, $4, $5) returning id",
    [input.email, input.displayName, input.role, input.campScope ?? null, actor.userId],
  )).rows[0]!;
  const token = await createResetToken(u.id, SETUP_LINK_MINUTES);
  await audit({ actorType: "staff", actorId: actor.userId, action: "user.create", targetType: "user", targetRef: u.id, outcome: "success", correlationId, code: input.role });
  return { id: u.id, setupUrl: `${config().NEXT_PUBLIC_SITE_URL}/workspace/reset#token=${token}` };
}

export async function updateUser(actor: StaffSession, userId: string, input: z.infer<typeof updateUserSchema>, correlationId: string) {
  const d = await db();
  return d.tx(async (q) => {
    const target = (await q.query<{ id: string; role: Role; status: string }>("select id, role, status from users where id = $1 for update", [userId])).rows[0];
    if (!target) throw Errors.notFound();
    // Separation of duties: nobody changes their own role/status (no self-promotion or lock-out).
    if (userId === actor.userId && (input.role || input.status || input.campScope !== undefined)) throw Errors.forbidden();
    const demotesSuperAdmin = target.role === "super_admin" && ((input.role && input.role !== "super_admin") || input.status === "deactivated");
    if (demotesSuperAdmin) {
      const others = (await q.query<{ n: number }>("select count(*)::int as n from users where role = 'super_admin' and status = 'active' and id <> $1", [userId])).rows[0]!.n;
      if (others === 0) throw Errors.conflict("At least one active Super Admin must remain.", "last_super_admin");
    }
    if (input.role && input.role !== target.role) {
      await q.query("update users set role = $2, updated_at = now() where id = $1", [userId, input.role]);
      await revokeAllUserSessions(userId, "role_changed", q);
      await audit({ actorType: "staff", actorId: actor.userId, action: "user.role_change", targetType: "user", targetRef: userId, outcome: "success", correlationId, details: { from: target.role, to: input.role } }, q);
    }
    if (input.status && input.status !== target.status) {
      await q.query("update users set status = $2, deactivated_at = case when $2 = 'deactivated' then now() else null end, updated_at = now() where id = $1", [userId, input.status]);
      if (input.status === "deactivated") await revokeAllUserSessions(userId, "deactivated", q);
      await audit({ actorType: "staff", actorId: actor.userId, action: input.status === "deactivated" ? "user.deactivate" : "user.reactivate", targetType: "user", targetRef: userId, outcome: "success", correlationId }, q);
    }
    if (input.campScope !== undefined) {
      await q.query("update users set camp_scope = $2, updated_at = now() where id = $1", [userId, input.campScope]);
      await audit({ actorType: "staff", actorId: actor.userId, action: "user.scope_change", targetType: "user", targetRef: userId, outcome: "success", correlationId }, q);
    }
    if (input.resetMfa) {
      await q.query("update users set mfa_enabled = false, mfa_secret_enc = null, mfa_last_step = null, updated_at = now() where id = $1", [userId]);
      await revokeAllUserSessions(userId, "mfa_reset", q);
      await audit({ actorType: "staff", actorId: actor.userId, action: "user.mfa_reset", targetType: "user", targetRef: userId, outcome: "success", correlationId }, q);
    }
    return { ok: true };
  });
}

export async function listActiveSessions() {
  const d = await db();
  return (await d.query<{ id: string; email: string; role: string; created_at: string; last_active_at: string; auth_method: string; mfa_verified: boolean }>(
    `select s.id, u.email, u.role, s.created_at, s.last_active_at, s.auth_method, s.mfa_verified from app_sessions s join users u on u.id = s.user_id
      where s.revoked_at is null and s.expires_at > now() order by s.last_active_at desc limit 200`,
  )).rows;
}

export async function adminRevokeSession(actor: StaffSession, sessionId: string, correlationId: string) {
  await revokeSession(sessionId, "admin_revoked");
  await audit({ actorType: "staff", actorId: actor.userId, action: "session.revoke", targetType: "session", targetRef: sessionId, outcome: "success", correlationId });
}

// ---------- Camps ----------

export async function listCamps(opts: { publicOnly?: boolean } = {}) {
  const d = await db();
  return (await d.query<{ id: string; code: string; name: string; working_area: string; starts_at: string | null; ends_at: string | null; capacity: number | null; status: string; is_public: boolean }>(
    `select id, code, name, working_area, starts_at, ends_at, capacity, status, is_public from camps
      ${opts.publicOnly ? "where is_public = true and status in ('planned','active','cancelled') and (ends_at is null or ends_at > now())" : ""}
      order by ${opts.publicOnly ? "coalesce(starts_at, created_at) asc" : "coalesce(starts_at, created_at) desc"}`,
  )).rows;
}

export async function upsertCamp(actor: StaffSession, input: z.infer<typeof campSchema>, campId: string | null, correlationId: string) {
  const d = await db();
  if (input.startsAt && input.endsAt && Date.parse(input.endsAt) < Date.parse(input.startsAt)) throw Errors.validation({ endsAt: "End must be after start" });
  const vals = [input.code, input.name, input.workingArea, input.startsAt ?? null, input.endsAt ?? null, input.capacity ?? null, input.status, input.isPublic];
  try {
    const id = campId
      ? (await d.query<{ id: string }>(
          "update camps set code=$2, name=$3, working_area=$4, starts_at=$5, ends_at=$6, capacity=$7, status=$8, is_public=$9, updated_at=now() where id=$1 returning id",
          [campId, ...vals])).rows[0]?.id
      : (await d.query<{ id: string }>(
          "insert into camps (code, name, working_area, starts_at, ends_at, capacity, status, is_public, created_by) values ($1,$2,$3,$4,$5,$6,$7,$8,$9) returning id",
          [...vals, actor.userId])).rows[0]!.id;
    if (!id) throw Errors.notFound();
    await audit({ actorType: "staff", actorId: actor.userId, action: campId ? "camp.update" : "camp.create", targetType: "camp", targetRef: id, outcome: "success", correlationId });
    return { id };
  } catch (e) {
    if ((e as { code?: string }).code === "23505") throw Errors.validation({ code: "This camp code is already used" });
    throw e;
  }
}

// ---------- Analytics (de-identified aggregates) ----------

export async function dashboardCounts(staff: StaffSession, filters: { campId?: string; from?: string; to?: string }) {
  const d = await db();
  const where: string[] = [];
  const args: unknown[] = [];
  if (filters.campId) { args.push(filters.campId); where.push(`camp_id = $${args.length}`); }
  if (filters.from) { args.push(filters.from); where.push(`created_at >= $${args.length}::date`); }
  if (filters.to) { args.push(filters.to); where.push(`created_at < ($${args.length}::date + 1)`); }
  if (staff.campScope) { args.push(staff.campScope); where.push(`camp_id = any($${args.length}::uuid[])`); }
  const w = where.length ? "where " + where.join(" and ") : "";
  const c = (await d.query<Record<string, number>>(
    `select count(*)::int as registered,
            count(*) filter (where questionnaire_completed_at is not null)::int as questionnaires_completed,
            count(*) filter (where status in ('questionnaire_completed','checked_in'))::int as awaiting_exam,
            count(*) filter (where status = 'exam_recorded')::int as awaiting_verification,
            count(*) filter (where group_code is not null)::int as categorised,
            count(*) filter (where status = 'report_ready')::int as report_ready,
            count(*) filter (where status = 'follow_up_due')::int as follow_up_due,
            count(*) filter (where status = 'withdrawn')::int as withdrawn,
            count(*) filter (where group_code = 1)::int as group1,
            count(*) filter (where group_code = 2)::int as group2,
            count(*) filter (where group_code = 3)::int as group3,
            count(*) filter (where group_code = 4)::int as group4
       from patients ${w}`, args)).rows[0]!;
  const byCamp = (await d.query<{ camp: string | null; registered: number; categorised: number }>(
    `select coalesce(c.name, 'No camp') as camp, count(*)::int as registered, count(*) filter (where p.group_code is not null)::int as categorised
       from patients p left join camps c on c.id = p.camp_id ${w.replace(/\b(camp_id|created_at)\b/g, "p.$1")}
      group by 1 order by 2 desc limit 20`, args)).rows;
  return { counts: c, byCamp };
}

export async function conversionCounts() {
  const d = await db();
  return (await d.query<{ name: string; last7: number; last30: number }>(
    `select name, count(*) filter (where occurred_at > now() - interval '7 days')::int as last7, count(*)::int as last30
       from analytics_events where occurred_at > now() - interval '30 days' group by name order by name`,
  )).rows;
}

const EXPORT_FIELDS = ["pseudo_id", "camp_code", "age_band", "driver_type", "habit_present", "group_code", "clinical_impression", "status", "registered_month"] as const;

/** Schema-limited de-identified export: no names, mobiles, programme IDs or free-text notes. */
export async function deidentifiedExport(staff: StaffSession, filters: { campId?: string; from?: string; to?: string }, correlationId: string) {
  const d = await db();
  const args: unknown[] = [];
  const where: string[] = [];
  if (filters.campId) { args.push(filters.campId); where.push(`p.camp_id = $${args.length}`); }
  if (filters.from) { args.push(filters.from); where.push(`p.created_at >= $${args.length}::date`); }
  if (filters.to) { args.push(filters.to); where.push(`p.created_at < ($${args.length}::date + 1)`); }
  if (staff.campScope) { args.push(staff.campScope); where.push(`p.camp_id = any($${args.length}::uuid[])`); }
  const rows = (await d.query<{ id: string; camp_code: string | null; age: number; driver_type: string; habit_present: boolean | null; group_code: number | null; clinical_impression: string | null; status: string; registered_month: string }>(
    `select p.id, c.code as camp_code, p.age, p.driver_type, p.habit_present, p.group_code, cl.clinical_impression, p.status,
            to_char(p.created_at, 'YYYY-MM') as registered_month
       from patients p left join camps c on c.id = p.camp_id
       left join lateral (select clinical_impression from classifications where patient_id = p.id order by computed_at desc limit 1) cl on true
      ${where.length ? "where " + where.join(" and ") : ""} order by p.created_at limit 50000`, args)).rows;
  const csvCell = (v: unknown) => {
    const s = v === null || v === undefined ? "" : String(v);
    // Neutralise spreadsheet formula injection and quote safely.
    const safe = /^[=+\-@\t\r]/.test(s) ? "'" + s : s;
    return /[",\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
  };
  const lines = [EXPORT_FIELDS.join(",")];
  for (const r of rows) {
    lines.push([hmac("pseudo:" + r.id).slice(0, 16), r.camp_code, ageBand(r.age), r.driver_type, r.habit_present, r.group_code, r.clinical_impression, r.status, r.registered_month].map(csvCell).join(","));
  }
  await d.query("insert into exports (requested_by, kind, filters, fields, row_count) values ($1, 'deidentified_csv', $2::jsonb, $3, $4)", [staff.userId, JSON.stringify(filters), [...EXPORT_FIELDS], rows.length]);
  await audit({ actorType: "staff", actorId: staff.userId, action: "export.deidentified", outcome: "success", correlationId, details: { rows: rows.length } });
  return lines.join("\n") + "\n";
}

export async function recentAudit(filters: { action?: string; actorId?: string; target?: string; outcome?: string; limit: number }) {
  const d = await db();
  const where: string[] = [];
  const args: unknown[] = [];
  if (filters.action) { args.push(filters.action + "%"); where.push(`a.action like $${args.length}`); }
  if (filters.actorId) { args.push(filters.actorId); where.push(`a.actor_id = $${args.length}`); }
  if (filters.target) { args.push(filters.target); where.push(`a.target_ref = $${args.length}`); }
  if (filters.outcome) { args.push(filters.outcome); where.push(`a.outcome = $${args.length}`); }
  args.push(filters.limit);
  return (await d.query<{ seq: number; occurred_at: string; actor_type: string; actor_email: string | null; action: string; target_type: string | null; target_ref: string | null; outcome: string; code: string | null; correlation_id: string }>(
    `select a.seq, a.occurred_at, a.actor_type, u.email as actor_email, a.action, a.target_type, a.target_ref, a.outcome, a.code, a.correlation_id
       from audit_events a left join users u on u.id::text = a.actor_id
      ${where.length ? "where " + where.join(" and ") : ""} order by a.seq desc limit $${args.length}`, args)).rows;
}

export async function recentErrors() {
  const d = await db();
  return (await d.query<{ occurred_at: string; category: string; code: string; route: string | null; correlation_id: string | null }>(
    "select occurred_at, category, code, route, correlation_id from app_errors order by id desc limit 100")).rows;
}
