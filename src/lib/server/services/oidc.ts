import "server-only";
import crypto from "node:crypto";
import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from "jose";
import { config } from "../config";
import { db } from "../db";
import { AppError, Errors } from "../errors";
import { audit } from "../audit";
import { randomToken } from "../security/crypto";
import { createStaffSession } from "../security/session";
import { DASHBOARD_FOR_ROLE } from "../authz";
import type { Role } from "@/lib/shared/constants";

// Amazon Cognito (Google federation) via OpenID Connect authorisation-code + PKCE.
// Cognito must enforce MFA for privileged users; Google/Cognito identity alone grants no role —
// the user must already exist (pre-provisioned, active) in our users table.

type Discovery = { authorization_endpoint: string; token_endpoint: string; jwks_uri: string; issuer: string };
let discovery: Promise<Discovery> | undefined;
let jwks: JWTVerifyGetKey | undefined;

export function setOidcTestOverrides(o: { discovery?: Discovery; jwks?: JWTVerifyGetKey }) {
  discovery = o.discovery ? Promise.resolve(o.discovery) : undefined;
  jwks = o.jwks;
}

async function getDiscovery(): Promise<Discovery> {
  return (discovery ??= (async () => {
    const issuer = config().OIDC_ISSUER!.replace(/\/$/, "");
    const res = await fetch(`${issuer}/.well-known/openid-configuration`, { signal: AbortSignal.timeout(5000) });
    if (!res.ok) throw new Error("oidc discovery failed");
    const d = (await res.json()) as Discovery;
    if (d.issuer.replace(/\/$/, "") !== issuer) throw new Error("oidc issuer mismatch");
    return d;
  })());
}

export async function oidcStart() {
  if (!config().OIDC_ENABLED) throw Errors.disabled("Organisation sign-in is not enabled.");
  const d = await getDiscovery();
  const state = randomToken(24);
  const nonce = randomToken(24);
  const verifier = randomToken(48);
  const challenge = crypto.createHash("sha256").update(verifier).digest("base64url");
  const url = new URL(d.authorization_endpoint);
  url.search = new URLSearchParams({
    response_type: "code",
    client_id: config().OIDC_CLIENT_ID!,
    redirect_uri: config().OIDC_REDIRECT_URI!, // fixed, server-configured redirect (never from the request)
    scope: "openid email profile",
    state,
    nonce,
    code_challenge: challenge,
    code_challenge_method: "S256",
  }).toString();
  return { url: url.toString(), cookie: JSON.stringify({ state, nonce, verifier }) };
}

export async function oidcCallback(params: { code: string | null; state: string | null }, cookieValue: string | undefined, correlationId: string) {
  if (!config().OIDC_ENABLED) throw Errors.disabled("Organisation sign-in is not enabled.");
  let saved: { state: string; nonce: string; verifier: string };
  try {
    saved = JSON.parse(cookieValue ?? "");
  } catch {
    throw new AppError(400, "oidc_state", "Sign-in expired. Please try again.");
  }
  if (!params.code || !params.state || params.state.length > 100 || !crypto.timingSafeEqual(Buffer.from(params.state.padEnd(64)), Buffer.from(saved.state.padEnd(64)))) {
    throw new AppError(400, "oidc_state", "Sign-in expired. Please try again.");
  }
  const d = await getDiscovery();
  const body = new URLSearchParams({ grant_type: "authorization_code", code: params.code, redirect_uri: config().OIDC_REDIRECT_URI!, client_id: config().OIDC_CLIENT_ID!, code_verifier: saved.verifier });
  const headers: Record<string, string> = { "content-type": "application/x-www-form-urlencoded" };
  if (config().OIDC_CLIENT_SECRET) headers.authorization = "Basic " + Buffer.from(`${config().OIDC_CLIENT_ID}:${config().OIDC_CLIENT_SECRET}`).toString("base64");
  const res = await fetch(d.token_endpoint, { method: "POST", headers, body, signal: AbortSignal.timeout(8000) });
  if (!res.ok) throw new AppError(401, "oidc_exchange", "Sign-in failed. Please try again.");
  const tokens = (await res.json()) as { id_token?: string };
  if (!tokens.id_token) throw new AppError(401, "oidc_exchange", "Sign-in failed. Please try again.");
  jwks ??= createRemoteJWKSet(new URL(d.jwks_uri));
  const { payload } = await jwtVerify(tokens.id_token, jwks, { issuer: d.issuer, audience: config().OIDC_CLIENT_ID!, maxTokenAge: "10m" }).catch(() => {
    throw new AppError(401, "oidc_token", "Sign-in failed. Please try again.");
  });
  if (payload.nonce !== saved.nonce) throw new AppError(401, "oidc_nonce", "Sign-in failed. Please try again.");
  const email = typeof payload.email === "string" ? payload.email.toLowerCase() : null;
  if (!email || payload.email_verified !== true || !payload.sub) throw new AppError(401, "oidc_claims", "Sign-in failed. Please try again.");

  const database = await db();
  const u = (await database.query<{ id: string; role: Role; status: string; oidc_subject: string | null }>(
    // First sign-in links by email only for accounts provisioned for organisation sign-in (no local
    // password); password accounts keep their own TOTP MFA and are never linked silently.
    "select id, role, status, oidc_subject from users where oidc_subject = $1 or (oidc_subject is null and password_hash is null and email = $2) order by oidc_subject nulls last limit 1",
    [payload.sub, email],
  )).rows[0];
  if (!u || u.status !== "active") {
    await audit({ actorType: "anonymous", action: "auth.oidc", outcome: "denied", correlationId, code: !u ? "not_provisioned" : "inactive" });
    // Fail closed with a generic message: no hint whether the account exists.
    throw new AppError(403, "not_authorised", "Your account is not authorised for this workspace. Contact a Super Admin.");
  }
  if (!u.oidc_subject) await database.query("update users set oidc_subject = $2 where id = $1", [u.id, payload.sub]);
  const session = await createStaffSession(u.id, { mfaVerified: true, authMethod: "oidc" });
  await audit({ actorType: "staff", actorId: u.id, action: "auth.oidc", outcome: "success", correlationId });
  return { ...session, redirect: DASHBOARD_FOR_ROLE[u.role] };
}
