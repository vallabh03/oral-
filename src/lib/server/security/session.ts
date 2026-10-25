import "server-only";
import { db, type Queryable } from "../db";
import { config } from "../config";
import { hashToken, randomToken } from "./crypto";
import type { Role } from "@/lib/shared/constants";

export const SESSION_IDLE_MIN = 30;
export const SESSION_ABSOLUTE_HOURS = 12;
export const INTAKE_SESSION_MIN = 120;
export const PENDING_MFA_MIN = 10;

export function staffCookieName() {
  return config().isProd ? "__Host-ds_session" : "ds_session";
}
export function intakeCookieName() {
  return config().isProd ? "__Host-ds_intake" : "ds_intake";
}

export function cookieOptions(maxAgeSec: number) {
  return {
    httpOnly: true,
    secure: config().isProd,
    sameSite: "strict" as const,
    path: "/",
    maxAge: maxAgeSec,
  };
}

export type StaffSession = {
  sessionId: string;
  userId: string;
  email: string;
  displayName: string;
  role: Role;
  campScope: string[] | null;
  csrfToken: string;
  mfaVerified: boolean;
  mfaEnabled: boolean;
  authMethod: "password" | "oidc";
  /** Keyed hash of the session token; binds signed photo URLs to this browser session. */
  tokenHash: string;
};

export async function createStaffSession(
  userId: string,
  opts: { mfaVerified: boolean; authMethod: "password" | "oidc" },
  q?: Queryable,
): Promise<{ token: string; csrfToken: string; maxAgeSec: number }> {
  const token = randomToken();
  const csrfToken = randomToken(24);
  const minutes = opts.mfaVerified ? SESSION_ABSOLUTE_HOURS * 60 : PENDING_MFA_MIN;
  const runner = q ?? (await db());
  await runner.query(
    `insert into app_sessions (token_hash, user_id, csrf_token, mfa_verified, auth_method, expires_at)
     values ($1, $2, $3, $4, $5, now() + make_interval(mins => $6))`,
    [hashToken(token), userId, csrfToken, opts.mfaVerified, opts.authMethod, minutes],
  );
  return { token, csrfToken, maxAgeSec: minutes * 60 };
}

/** Validates token, expiry, idle timeout, revocation and active account on every request. */
export async function readStaffSession(token: string | undefined | null): Promise<StaffSession | null> {
  if (!token || token.length > 128) return null;
  const d = await db();
  const r = await d.query<{
    session_id: string; user_id: string; email: string; display_name: string; role: Role; camp_scope: string[] | null;
    csrf_token: string; mfa_verified: boolean; mfa_enabled: boolean; auth_method: "password" | "oidc"; idle_sec: number;
  }>(
    `select s.id as session_id, u.id as user_id, u.email, u.display_name, u.role, u.camp_scope, s.csrf_token, s.mfa_verified,
            u.mfa_enabled, s.auth_method, extract(epoch from now() - s.last_active_at)::float8 as idle_sec
       from app_sessions s join users u on u.id = s.user_id
      where s.token_hash = $1 and s.revoked_at is null and s.expires_at > now()
        and s.last_active_at > now() - make_interval(mins => $2)
        and u.status = 'active'`,
    [hashToken(token), SESSION_IDLE_MIN],
  );
  const row = r.rows[0];
  if (!row) return null;
  if (row.idle_sec > 60) await d.query("update app_sessions set last_active_at = now() where id = $1", [row.session_id]);
  return {
    sessionId: row.session_id,
    userId: row.user_id,
    email: row.email,
    displayName: row.display_name,
    role: row.role,
    campScope: row.camp_scope,
    csrfToken: row.csrf_token,
    mfaVerified: row.mfa_verified,
    mfaEnabled: row.mfa_enabled,
    authMethod: row.auth_method,
    tokenHash: hashToken(token),
  };
}

export async function revokeSession(sessionId: string, reason: string, q?: Queryable) {
  const runner = q ?? (await db());
  await runner.query("update app_sessions set revoked_at = now(), revoked_reason = $2 where id = $1 and revoked_at is null", [sessionId, reason]);
}

export async function revokeAllUserSessions(userId: string, reason: string, q?: Queryable) {
  const runner = q ?? (await db());
  await runner.query("update app_sessions set revoked_at = now(), revoked_reason = $2 where user_id = $1 and revoked_at is null", [userId, reason]);
}

export type IntakeSession = { sessionId: string; patientId: string };

export async function createIntakeSession(patientId: string, q?: Queryable): Promise<{ token: string; maxAgeSec: number }> {
  const token = randomToken();
  const runner = q ?? (await db());
  await runner.query(
    "insert into intake_sessions (token_hash, patient_id, expires_at) values ($1, $2, now() + make_interval(mins => $3))",
    [hashToken(token), patientId, INTAKE_SESSION_MIN],
  );
  return { token, maxAgeSec: INTAKE_SESSION_MIN * 60 };
}

export async function readIntakeSession(token: string | undefined | null): Promise<IntakeSession | null> {
  if (!token || token.length > 128) return null;
  const d = await db();
  const r = await d.query<{ id: string; patient_id: string }>(
    `select i.id, i.patient_id from intake_sessions i join patients p on p.id = i.patient_id
      where i.token_hash = $1 and i.revoked_at is null and i.expires_at > now() and p.status <> 'withdrawn'`,
    [hashToken(token)],
  );
  const row = r.rows[0];
  return row ? { sessionId: row.id, patientId: row.patient_id } : null;
}
