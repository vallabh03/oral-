import crypto from "node:crypto";
import { NextRequest } from "next/server";
import { db } from "@/lib/server/db";
import { totp } from "@/lib/server/security/totp";
import type { Role } from "@/lib/shared/constants";
import { seedCamp, seedUser, syntheticPortrait } from "../scripts/seed-lib";

export const ORIGIN = "http://localhost:3000";
type Handler = (req: NextRequest, ctx: { params: Promise<Record<string, string>> }) => Promise<Response>;

export type Jar = { cookies: Record<string, string>; csrf?: string };

/** Builds a request the way a same-origin browser would send it. */
export function req(method: string, path: string, opts: { body?: unknown; raw?: Buffer; contentType?: string; jar?: Jar; headers?: Record<string, string>; origin?: string | null } = {}) {
  const headers = new Headers(opts.headers);
  if (opts.origin !== null) headers.set("origin", opts.origin ?? ORIGIN);
  if (opts.jar && Object.keys(opts.jar.cookies).length) headers.set("cookie", Object.entries(opts.jar.cookies).map(([k, v]) => `${k}=${v}`).join("; "));
  if (opts.jar?.csrf && !headers.has("x-csrf-token")) headers.set("x-csrf-token", opts.jar.csrf);
  let body: BodyInit | undefined;
  if (opts.raw) {
    body = new Uint8Array(opts.raw);
    headers.set("content-type", opts.contentType ?? "image/jpeg");
    headers.set("content-length", String(opts.raw.length));
  } else if (opts.body !== undefined) {
    body = typeof opts.body === "string" ? opts.body : JSON.stringify(opts.body);
    if (!headers.has("content-type")) headers.set("content-type", "application/json");
  }
  return new NextRequest(new URL(path, ORIGIN), { method, headers, body });
}

export async function call(handler: Handler, request: NextRequest, params: Record<string, string> = {}, jar?: Jar) {
  const res = await handler(request, { params: Promise.resolve(params) });
  // Persist Set-Cookie into the jar like a browser.
  if (jar) {
    for (const c of res.headers.getSetCookie()) {
      const [pair] = c.split(";");
      const [k, ...v] = pair!.split("=");
      const value = v.join("=");
      if (value === "" || /Max-Age=0/i.test(c)) delete jar.cookies[k!];
      else jar.cookies[k!] = value;
    }
  }
  const text = await res.text();
  let json: any = null;
  try { json = text ? JSON.parse(text) : null; } catch { json = null; }
  return { status: res.status, json, text, headers: res.headers };
}

export const randomIp = () => `10.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}`;
export const key = () => crypto.randomUUID().replace(/-/g, "") + "k";

export async function staffJar(role: Role, opts: { email?: string; campScope?: string[] | null } = {}) {
  const { POST: login } = await import("@/app/api/auth/login/route");
  const { POST: mfa } = await import("@/app/api/auth/mfa/route");
  const email = opts.email ?? `${role}.${crypto.randomUUID().slice(0, 8)}@example.test`;
  const u = await seedUser(email, `Test ${role}`, role, opts.campScope ?? null);
  const jar: Jar = { cookies: {} };
  const l = await call(login, req("POST", "/api/auth/login", { body: { email, password: u.password }, headers: { "x-forwarded-for": randomIp() } }), {}, jar);
  if (l.status !== 200) throw new Error(`login failed ${l.status} ${l.text}`);
  jar.csrf = l.json.csrfToken;
  const m = await call(mfa, req("POST", "/api/auth/mfa", { body: { code: totp(u.totpSecret) }, jar }), {}, jar);
  if (m.status !== 200) throw new Error(`mfa failed ${m.status} ${m.text}`);
  // Full session gets a fresh CSRF token; read it from the session row.
  const d = await db();
  const row = (await d.query<{ csrf_token: string }>("select csrf_token from app_sessions where user_id = $1 and mfa_verified and revoked_at is null order by created_at desc limit 1", [u.id])).rows[0]!;
  jar.csrf = row.csrf_token;
  return { jar, user: u };
}

export function registration(overrides: Record<string, unknown> = {}) {
  return {
    fullName: `Test Driver ${crypto.randomUUID().slice(0, 6).replace(/\d/g, "x")}`,
    age: 35,
    mobile: `9${String(Math.floor(100000000 + Math.random() * 899999999))}`,
    driverType: "auto",
    workingArea: "Ameerpet",
    recruitmentSource: "stand",
    contactPreference: "whatsapp",
    language: "en",
    consents: { registration: true, screening: true, followupContact: true, whatsappReport: true, photo: true },
    idempotencyKey: key(),
    ...overrides,
  };
}

/** Registers a participant through the public API; returns the intake cookie jar. */
export async function registerParticipant(overrides: Record<string, unknown> = {}) {
  const { POST } = await import("@/app/api/intake/register/route");
  const jar: Jar = { cookies: {} };
  const r = await call(POST, req("POST", "/api/intake/register", { body: registration(overrides), headers: { "x-forwarded-for": randomIp() } }), {}, jar);
  if (r.status !== 201) throw new Error(`register failed ${r.status} ${r.text}`);
  const d = await db();
  const id = (await d.query<{ id: string }>("select id from patients where display_id = $1", [r.json.displayId])).rows[0]!.id;
  return { jar, displayId: r.json.displayId as string, resumeToken: r.json.resumeToken as string, patientId: id };
}

export const COMPLETE_ANSWERS = {
  habits: ["gutkha"], duration: "gt10", frequency: "gt5", symptoms: ["patch"], symptom_gt_2w: "yes",
  risk_awareness: "no", sign_awareness: "no", previous_screening: "no", cessation_interest: "yes",
};

export { seedCamp, syntheticPortrait };
