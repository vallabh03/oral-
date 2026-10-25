import "server-only";
import { db } from "../db";
import { config } from "../config";
import { AppError, Errors } from "../errors";
import { audit } from "../audit";
import { decryptSecret, encryptSecret, hashToken, randomToken, sha256 } from "../security/crypto";
import { hashPassword, passwordPolicyError, verifyPassword } from "../security/password";
import { generateTotpSecret, otpauthUri, verifyTotp } from "../security/totp";
import { enforceRateLimit, LIMITS } from "../security/rateLimit";
import { createStaffSession, revokeAllUserSessions, revokeSession, type StaffSession } from "../security/session";
import { sendEmail } from "../email";
import { DASHBOARD_FOR_ROLE } from "../authz";
import type { Role } from "@/lib/shared/constants";

const LOCK_AFTER = 5;
const LOCK_MINUTES = 15;
const RESET_TOKEN_MINUTES = 30;
// Identical message for unknown email, wrong password, deactivated or locked account.
const GENERIC_LOGIN_ERROR = "Email or password is incorrect.";

type UserRow = { id: string; email: string; role: Role; status: string; password_hash: string | null; mfa_enabled: boolean; mfa_secret_enc: string | null; mfa_last_step: number | null; locked: boolean };

export async function login(email: string, password: string, ipKey: string, correlationId: string) {
  if (!config().AUTH_PASSWORD_ENABLED) throw Errors.disabled("Password sign-in is disabled. Use your organisation sign-in.");
  await enforceRateLimit(LIMITS.login, ipKey);
  await enforceRateLimit(LIMITS.loginAccount, sha256(email));
  const d = await db();
  const u = (await d.query<UserRow>(
    `select id, email, role, status, password_hash, mfa_enabled, mfa_secret_enc, mfa_last_step, coalesce(locked_until > now(), false) as locked
       from users where email = $1`, [email])).rows[0];
  const passwordOk = await verifyPassword(u?.password_hash, password); // always runs (timing-safe for unknown users)
  if (!u || !passwordOk || u.status !== "active" || u.locked) {
    if (u && !passwordOk) {
      await d.query(
        // An active lock is never extended, and the counter restarts once a lock has expired, so an
        // attacker cannot keep a known account locked out indefinitely.
        `update users set
                failed_logins = case when locked_until > now() then failed_logins
                                     when locked_until is not null then 1 else failed_logins + 1 end,
                locked_until = case when locked_until > now() then locked_until
                                    when (case when locked_until is not null then 1 else failed_logins + 1 end) >= $2
                                      then now() + make_interval(mins => $3)
                                    else null end
          where id = $1`,
        [u.id, LOCK_AFTER, LOCK_MINUTES],
      );
    }
    await audit({ actorType: "anonymous", actorId: u?.id ?? null, action: "auth.login", outcome: "denied", correlationId, code: !u ? "unknown_user" : u.locked ? "locked" : u.status !== "active" ? "inactive" : "bad_password" });
    throw new AppError(401, "invalid_credentials", GENERIC_LOGIN_ERROR);
  }
  await d.query("update users set failed_logins = 0, locked_until = null where id = $1", [u.id]);
  const session = await createStaffSession(u.id, { mfaVerified: false, authMethod: "password" });
  await audit({ actorType: "staff", actorId: u.id, action: "auth.password_ok", outcome: "success", correlationId });
  // MFA is mandatory for every staff role: either verify or enrol before any workspace access.
  return { ...session, next: u.mfa_enabled ? ("mfa" as const) : ("mfa-enroll" as const) };
}

async function loadUser(userId: string) {
  const d = await db();
  return (await d.query<UserRow>("select id, email, role, status, password_hash, mfa_enabled, mfa_secret_enc, mfa_last_step, false as locked from users where id = $1", [userId])).rows[0]!;
}

async function upgradeSession(pending: StaffSession, correlationId: string) {
  await revokeSession(pending.sessionId, "mfa_upgraded"); // new token after privilege change (anti session-fixation)
  const s = await createStaffSession(pending.userId, { mfaVerified: true, authMethod: pending.authMethod });
  await audit({ actorType: "staff", actorId: pending.userId, action: "auth.session_issued", outcome: "success", correlationId });
  return { ...s, redirect: DASHBOARD_FOR_ROLE[pending.role] };
}

export async function verifyMfa(pending: StaffSession, code: string, correlationId: string) {
  await enforceRateLimit(LIMITS.mfa, pending.userId);
  const u = await loadUser(pending.userId);
  if (!u.mfa_enabled || !u.mfa_secret_enc) throw new AppError(409, "mfa_not_enrolled", "Set up two-step verification first.");
  const step = verifyTotp(decryptSecret(u.mfa_secret_enc), code, u.mfa_last_step === null ? null : Number(u.mfa_last_step));
  if (step === null) {
    await audit({ actorType: "staff", actorId: u.id, action: "auth.mfa", outcome: "denied", correlationId });
    throw new AppError(401, "invalid_code", "That code is not valid. Check your authenticator app and try again.");
  }
  const d = await db();
  // Compare-and-set: two parallel requests cannot both consume the same code.
  const won = await d.query("update users set mfa_last_step = $2 where id = $1 and (mfa_last_step is null or mfa_last_step < $2) returning id", [u.id, step]);
  if (!won.rows.length) throw new AppError(401, "invalid_code", "That code is not valid. Check your authenticator app and try again.");
  return upgradeSession(pending, correlationId);
}

export async function beginMfaEnrollment(pending: StaffSession) {
  const u = await loadUser(pending.userId);
  if (u.mfa_enabled) throw new AppError(409, "mfa_already_enrolled", "Two-step verification is already set up.");
  const secret = generateTotpSecret();
  const d = await db();
  await d.query("update users set mfa_secret_enc = $2 where id = $1 and mfa_enabled = false", [u.id, encryptSecret(secret)]);
  const QR = await import("qrcode");
  const uri = otpauthUri(secret, u.email);
  return { secret, uri, qrSvg: await QR.toString(uri, { type: "svg", margin: 1, width: 200 }) };
}

export async function completeMfaEnrollment(pending: StaffSession, code: string, correlationId: string) {
  await enforceRateLimit(LIMITS.mfa, pending.userId);
  const u = await loadUser(pending.userId);
  if (u.mfa_enabled || !u.mfa_secret_enc) throw new AppError(409, "mfa_enroll_not_started", "Start two-step setup again.");
  const step = verifyTotp(decryptSecret(u.mfa_secret_enc), code, null);
  if (step === null) throw new AppError(401, "invalid_code", "That code is not valid. Check the time on your phone and try again.");
  const d = await db();
  await d.query("update users set mfa_enabled = true, mfa_last_step = $2, updated_at = now() where id = $1", [u.id, step]);
  await audit({ actorType: "staff", actorId: u.id, action: "auth.mfa_enrolled", outcome: "success", correlationId });
  return upgradeSession(pending, correlationId);
}

export async function logout(session: StaffSession, correlationId: string) {
  await revokeSession(session.sessionId, "logout");
  await audit({ actorType: "staff", actorId: session.userId, action: "auth.logout", outcome: "success", correlationId });
}

/** Always responds the same way, whether or not the email exists (anti-enumeration). */
export async function requestPasswordReset(email: string, ipKey: string, correlationId: string) {
  await enforceRateLimit(LIMITS.passwordReset, ipKey);
  await enforceRateLimit(LIMITS.passwordReset, sha256(email));
  const d = await db();
  const u = (await d.query<{ id: string }>("select id from users where email = $1 and status = 'active'", [email])).rows[0];
  if (u) {
    const token = await createResetToken(u.id);
    await sendEmail({
      to: email,
      subject: "Reset your DRIVE SAFE workspace password",
      text: `A password reset was requested for your account. This link expires in ${RESET_TOKEN_MINUTES} minutes and works once:\n\n${config().NEXT_PUBLIC_SITE_URL}/workspace/reset#token=${token}\n\nIf you did not ask for this, ignore this email.`,
    });
  }
  await audit({ actorType: "anonymous", actorId: u?.id ?? null, action: "auth.reset_requested", outcome: "success", correlationId, code: u ? "sent" : "no_account" });
}

/** Single-use token. Password resets expire in 30 minutes; first-time account setup links in 24 hours. */
export const SETUP_LINK_MINUTES = 24 * 60;
export async function createResetToken(userId: string, minutes = RESET_TOKEN_MINUTES): Promise<string> {
  const token = randomToken();
  const d = await db();
  await d.query("update password_reset_tokens set used_at = now() where user_id = $1 and used_at is null", [userId]);
  await d.query("insert into password_reset_tokens (user_id, token_hash, expires_at) values ($1, $2, now() + make_interval(mins => $3))", [userId, hashToken(token), minutes]);
  return token;
}

export async function completePasswordReset(token: string, password: string, ipKey: string, correlationId: string) {
  await enforceRateLimit(LIMITS.passwordReset, ipKey);
  const d = await db();
  return d.tx(async (q) => {
    const row = (await q.query<{ user_id: string; email: string }>(
      `update password_reset_tokens t set used_at = now() from users u
        where t.token_hash = $1 and t.used_at is null and t.expires_at > now() and u.id = t.user_id and u.status = 'active'
        returning t.user_id, u.email`, [hashToken(token)])).rows[0];
    if (!row) throw new AppError(400, "invalid_token", "This reset link is invalid or has expired. Ask for a new one.");
    const policy = passwordPolicyError(password, row.email);
    if (policy) throw Errors.validation({ password: policy });
    await q.query("update users set password_hash = $2, password_changed_at = now(), failed_logins = 0, locked_until = null, updated_at = now() where id = $1", [row.user_id, await hashPassword(password)]);
    await revokeAllUserSessions(row.user_id, "password_reset", q);
    await audit({ actorType: "staff", actorId: row.user_id, action: "auth.password_reset", outcome: "success", correlationId }, q);
    return { ok: true };
  });
}
