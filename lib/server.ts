import { permitted, type Permission } from "./permissions";
import { pilot, groupPaths } from "./domain";
import { env } from "cloudflare:workers";
import { getChatGPTUser } from "@/app/chatgpt-auth";
import { canAccess, roles, hasRole } from "./domain";
export function runtime() {
  return env as unknown as {
    DB: D1Database;
    BUCKET: R2Bucket;
    ADMIN_EMAIL?: string;
    ADMIN_EMAILS?: string;
    LIVE_INTAKE_ENABLED?: string;
    STAFF_ACCESS_ENABLED?: string;
    AUDIT_KEY?: string;
    PUBLIC_INTAKE_ENABLED?: string;
    PRIVACY_NOTICE?: string;
    CONSENT_VERSION?: string;
    CONTACT_EMAIL?: string;
    CONTACT_PHONE?: string;
    WHATSAPP_ENABLED?: string;
    WHATSAPP_PHONE_NUMBER_ID?: string;
    WHATSAPP_ACCESS_TOKEN?: string;
    WHATSAPP_REPORT_TEMPLATE_NAME?: string;
    WHATSAPP_TEMPLATE_LANGUAGE?: string;
    WHATSAPP_GRAPH_VERSION?: string;
  };
}
export function db() {
  return runtime().DB;
}
export async function boundedBody(req: Request, limit: number) {
  const reader = req.body?.getReader();
  if (!reader) return new Uint8Array();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > limit) {
      await reader.cancel();
      throw new HttpError(413, "Request exceeds the permitted size.");
    }
    chunks.push(value);
  }
  const result = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return result;
}
export const id = (prefix: string) =>
  prefix + "-" + crypto.randomUUID().toUpperCase();
export const now = () => new Date().toISOString();
export async function hash(v: string) {
  return [
    ...new Uint8Array(
      await crypto.subtle.digest("SHA-256", new TextEncoder().encode(v)),
    ),
  ]
    .map((x) => x.toString(16).padStart(2, "0"))
    .join("");
}
export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
export type Actor = {
  id: string;
  name: string;
  role: string;
  tenant: string;
  demo: boolean;
  patientId?: string;
};
export async function actor(
  req: Request,
  options: { skipSession?: boolean; forceLive?: boolean } = {},
): Promise<Actor> {
  const u = await getChatGPTUser();
  if (!u) throw new HttpError(401, "Sign in to access this workspace.");
  const demo =
    !options.forceLive &&
    (req.headers.get("x-care-mode") === "demo" ||
      new URL(req.url).searchParams.get("mode") === "demo");
  if (demo)
    return {
      id: u.userId,
      name: u.displayName,
      role: "SUPER_ADMIN",
      tenant: "demo:" + u.userId,
      demo: true,
    };
  if (
    (runtime().STAFF_ACCESS_ENABLED !== "true" &&
      runtime().LIVE_INTAKE_ENABLED !== "true") ||
    !runtime().AUDIT_KEY
  )
    throw new HttpError(
      503,
      "Staff access is locked. Administrator setup and operational approval are required.",
    );
  let row = await db()
    .prepare("SELECT * FROM users WHERE id=? AND active=1")
    .bind(u.userId)
    .first<any>();
  const bootstrapEmails = [
    runtime().ADMIN_EMAIL,
    ...(runtime().ADMIN_EMAILS ?? "").split(","),
  ]
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);
  if (!row && bootstrapEmails.includes(u.email.trim().toLowerCase())) {
    await db()
      .prepare(
        "INSERT OR IGNORE INTO users (id,email,name,role,active) VALUES (?,?,?,?,1)",
      )
      .bind(u.userId, u.email, u.displayName, "SUPER_ADMIN")
      .run();
    row = await db()
      .prepare("SELECT * FROM users WHERE id=? AND active=1")
      .bind(u.userId)
      .first<any>();
  }
  if (!row || !roles.includes(row.role))
    throw new HttpError(
      403,
      "An administrator must grant access to this account.",
    );
  if (!options.skipSession) await validateSession(req, u.userId);
  return {
    id: u.userId,
    name: row.name,
    role: row.role,
    tenant: "live",
    demo: false,
    patientId: row.patient_id,
  };
}
export function requireRole(a: Actor, ...allow: string[]) {
  if (!a.demo && !hasRole(a.role, ...allow))
    throw new HttpError(403, "Your role cannot perform this action.");
}
export async function patient(a: Actor, pid: string) {
  const p = await db()
    .prepare("SELECT * FROM patients WHERE id=? AND tenant=?")
    .bind(pid, a.tenant)
    .first<any>();
  if (!p) throw new HttpError(404, "Record unavailable.");
  if (!a.demo && !canAccess(a.role, a.id, p, a.patientId)) {
    if (
      a.role !== "LAB" ||
      !(await db()
        .prepare("SELECT id FROM samples WHERE patient_id=? AND lab_id=?")
        .bind(pid, a.id)
        .first())
    )
      throw new HttpError(404, "Record unavailable.");
  }
  return p;
}
export async function auditStatement(
  a: Actor,
  action: string,
  pid: string | null = null,
) {
  const uid = id("EVT"),
    at = now();
  const text = JSON.stringify({
    id: uid,
    tenant: a.tenant,
    patientId: pid,
    actor: a.id,
    action,
    at,
  });
  const secret = runtime().AUDIT_KEY;
  if (!a.demo && !secret)
    throw new HttpError(503, "Audit signing is not configured.");
  let signature = "DEMO";
  if (secret) {
    const key = await crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode(secret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"],
    );
    signature = [
      ...new Uint8Array(
        await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(text)),
      ),
    ]
      .map((x) => x.toString(16).padStart(2, "0"))
      .join("");
  }
  return db()
    .prepare(
      "INSERT INTO audit (id,tenant,patient_id,actor,action,at,signature) VALUES (?,?,?,?,?,?,?)",
    )
    .bind(uid, a.tenant, pid, a.id, action, at, signature);
}
export async function log(a: Actor, action: string, pid: string | null = null) {
  await (await auditStatement(a, action, pid)).run();
}
export async function rate(a: Actor) {
  const bucket = Math.floor(Date.now() / 60000),
    key = a.id + ":" + bucket;
  const r = await db()
    .prepare(
      "INSERT INTO limits (id,count,expires) VALUES (?,1,?) ON CONFLICT(id) DO UPDATE SET count=count+1 RETURNING count",
    )
    .bind(key, bucket + 2)
    .first<any>();
  if (r.count > 120)
    throw new HttpError(429, "Please wait a minute before trying again.");
  if (Math.random() < 0.01)
    await db().prepare("DELETE FROM limits WHERE expires<?").bind(bucket).run();
}
export function response(data: unknown, status = 200) {
  return Response.json(data, {
    status,
    headers: {
      "Cache-Control": "no-store, private",
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "no-referrer",
    },
  });
}
export async function failure(e: unknown) {
  if (e instanceof HttpError) return response({ error: e.message }, e.status);
  if (e instanceof Error && e.name === "ZodError")
    return response(
      { error: "Please check the supplied fields and required values." },
      400,
    );
  try {
    await db()
      .prepare("INSERT INTO app_errors(id,at,code) VALUES (?,?,?)")
      .bind(id("ERR"), now(), "internal_error")
      .run();
  } catch {}
  return response(
    {
      error:
        "The request could not be completed. Your unsaved input remains on this page.",
    },
    500,
  );
}
export function originCheck(req: Request) {
  if (req.headers.get("origin") !== new URL(req.url).origin)
    throw new HttpError(403, "Request origin rejected.");
  if (!req.headers.get("content-type")?.includes("application/json"))
    throw new HttpError(415, "Expected JSON");
  if (Number(req.headers.get("content-length") || 0) > 100000)
    throw new HttpError(413, "Request too large.");
}
export async function seed(a: Actor) {
  if (!a.demo) return;
  const existing = await db()
    .prepare("SELECT id FROM camps WHERE tenant=? LIMIT 1")
    .bind(a.tenant)
    .first();
  if (existing) return;
  const camp = id("CAMP"),
    at = now();
  const stmts = [
    db()
      .prepare(
        "INSERT INTO camps (id,tenant,name,location,date) VALUES (?,?,?,?,?)",
      )
      .bind(
        camp,
        a.tenant,
        "Community screening camp",
        "Hyderabad",
        at.slice(0, 10),
      ),
  ];
  stmts.push(
    db()
      .prepare(
        "INSERT INTO protocols (id,tenant,version,definition,status,created_by) VALUES (?,?,?,?,?,?)",
      )
      .bind(
        id("PROT"),
        a.tenant,
        pilot.version,
        JSON.stringify(pilot),
        "Pilot draft",
        a.id,
      ),
  );
  const names = [
    "Demo Participant A",
    "Demo Participant B",
    "Demo Participant C",
    "Demo Participant D",
    "Demo Participant E",
    "Demo Participant F",
  ];
  for (let i = 0; i < names.length; i++) {
    const pid = id("HAOC-DS");
    stmts.push(
      db()
        .prepare(
          "INSERT INTO patients (id,tenant,name,phone,working_area,age,camp_id,created_at,category,pathway,demo) VALUES (?,?,?,?,?,?,?,?,?,?,1)",
        )
        .bind(
          pid,
          a.tenant,
          names[i],
          "000000000" + i,
          "Synthetic working area",
          30 + i * 5,
          camp,
          at,
          i === 5 ? null : String((i % 4) + 1),
          i === 5 ? "Awaiting screening" : groupPaths[String((i % 4) + 1)],
        ),
    );
    for (const type of ["registration", "screening"])
      stmts.push(
        db()
          .prepare(
            "INSERT INTO consents (id,patient_id,type,status,version,at,actor,method) VALUES (?,?,?,?,?,?,?,?)",
          )
          .bind(
            id("CON"),
            pid,
            type,
            "granted",
            "DEMO-1",
            at,
            a.id,
            "Synthetic fixture",
          ),
      );
    if (i < 3)
      stmts.push(
        db()
          .prepare(
            "INSERT INTO records (id,patient_id,kind,data,status,at,actor) VALUES (?,?,?,?,?,?,?)",
          )
          .bind(
            id("REC"),
            pid,
            "followup",
            JSON.stringify({
              date: at.slice(0, 10),
              notes: "Synthetic follow-up appointment",
            }),
            "Pending",
            at,
            a.id,
          ),
      );
    const demoSample = id("SAMP-ORL");
    if (i === 2)
      stmts.push(
        db()
          .prepare(
            "INSERT INTO samples (id,patient_id,type,status,collected_at,collected_by,location,revision) VALUES (?,?,?,?,?,?,?,0)",
          )
          .bind(
            demoSample,
            pid,
            "Oral sample",
            "Collected",
            at,
            a.id,
            "Demo collection desk",
          ),
        sampleEvent(a, demoSample, pid, "Collected"),
      );
    stmts.push(await auditStatement(a, "Synthetic patient registered", pid));
  }
  await db().batch(stmts);
}

// Append-only sample lifecycle event, written in the same batch as the status change.
export function sampleEvent(
  a: Actor,
  sampleId: string,
  patientId: string,
  status: string,
) {
  return db()
    .prepare(
      "INSERT INTO sample_events (id,sample_id,patient_id,status,at,actor) VALUES (?,?,?,?,?,?)",
    )
    .bind(
      "SEV-" + crypto.randomUUID(),
      sampleId,
      patientId,
      status,
      new Date().toISOString(),
      a.id,
    );
}

export async function requirePermission(a: Actor, p: Permission) {
  if (!a.demo && !permitted(a.role, p)) {
    await log(a, "Access denied: " + p);
    throw new HttpError(403, "Your account cannot perform this action.");
  }
}
export async function securityPolicy() {
  const row = await db()
    .prepare("SELECT value FROM app_settings WHERE id='security'")
    .first<any>();
  return row ? JSON.parse(row.value) : { idleMinutes: 15, absoluteHours: 8 };
}
export function sessionToken(req: Request) {
  const cookies = req.headers.get("cookie") || "";
  return (
    cookies
      .split(";")
      .map((s) => s.trim())
      .find((s) => s.startsWith("__Host-care_session="))
      ?.split("=")[1] ||
    cookies
      .split(";")
      .map((s) => s.trim())
      .find((s) => s.startsWith("care_session="))
      ?.split("=")[1] ||
    ""
  );
}
export async function validateSession(req: Request, userId: string) {
  const token = sessionToken(req);
  if (!token)
    throw new HttpError(401, "Open your secure workspace to start a session.");
  const key = await hash(token),
    time = Date.now();
  const row = await db()
    .prepare("SELECT * FROM app_sessions WHERE token_hash=? AND user_id=?")
    .bind(key, userId)
    .first<any>();
  const policy = await securityPolicy();
  if (
    !row ||
    row.revoked ||
    row.expires_at <= time ||
    row.last_seen + policy.idleMinutes * 60000 <= time ||
    row.created_at + policy.absoluteHours * 3600000 <= time
  )
    throw new HttpError(401, "Your session has expired. Sign in again.");
  const result = await db()
    .prepare(
      "UPDATE app_sessions SET last_seen=? WHERE token_hash=? AND revoked=0 AND expires_at>? AND last_seen>?",
    )
    .bind(time, key, time, time - policy.idleMinutes * 60000)
    .run();
  if (!result.meta.changes)
    throw new HttpError(401, "Your session has expired.");
}
