import { permitted, type Permission } from "./permissions";
import { isBootstrapAdmin, isBootstrapEmail } from "./admin-emails";
import { pilot, groupPaths } from "./domain";
import { env } from "cloudflare:workers";
import { getChatGPTUser } from "@/app/chatgpt-auth";
import { canAccess, roles, hasRole } from "./domain";
import { logEntry } from "./telemetry";

// ---------------------------------------------------------------------------
// Runtime environment binding
// ---------------------------------------------------------------------------
export function runtime() {
  return env as unknown as {
    DB: D1Database;
    BUCKET: R2Bucket;
    /** Optional KV namespace for rate-limiting (preferred over D1) */
    RATE_KV?: KVNamespace;
    ADMIN_EMAIL?: string;
    ADMIN_EMAILS?: string;
    DOCTOR_ADMIN_EMAILS?: string;
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
    /**
     * Set to "true" to allow authenticated users to enter demo mode.
     * When STAFF_ACCESS_ENABLED is "true" and this is not explicitly "true",
     * demo mode is blocked so live operators cannot accidentally use it.
     */
    DEMO_MODE_ENABLED?: string;
  };
}

export function db() {
  return runtime().DB;
}

// ---------------------------------------------------------------------------
// Bounded body reader — prevents memory exhaustion
// ---------------------------------------------------------------------------
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

// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------
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

// ---------------------------------------------------------------------------
// HTTP error class
// ---------------------------------------------------------------------------
export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
    this.name = "HttpError";
  }
}

// ---------------------------------------------------------------------------
// Actor type
// ---------------------------------------------------------------------------
export type Actor = {
  id: string;
  name: string;
  role: string;
  tenant: string;
  demo: boolean;
  patientId?: string;
};

// ---------------------------------------------------------------------------
// Security policy — with 60-second module-level cache
// Avoids a D1 read on every single authenticated request.
// ---------------------------------------------------------------------------
type Policy = { idleMinutes: number; absoluteHours: number };

let _policyCache: { v: Policy; ts: number } | null = null;
const POLICY_TTL_MS = 60_000; // 60 seconds

export async function securityPolicy(): Promise<Policy> {
  const now_ms = Date.now();
  // Fast path: module-level cache (within this isolate)
  if (_policyCache && now_ms - _policyCache.ts < POLICY_TTL_MS)
    return _policyCache.v;

  // Mid path: KV cache (consistent across all isolates, avoids D1 read)
  const kv = runtime().RATE_KV;
  if (kv) {
    const kvVal = await kv.get("policy:security");
    if (kvVal) {
      const v = JSON.parse(kvVal) as Policy;
      _policyCache = { v, ts: now_ms };
      return v;
    }
  }

  // Slow path: D1 read, then populate both caches
  const row = await db()
    .prepare("SELECT value FROM app_settings WHERE id='security'")
    .first<{ value: string }>();

  const v: Policy = row
    ? (JSON.parse(row.value) as Policy)
    : { idleMinutes: 15, absoluteHours: 8 };

  _policyCache = { v, ts: now_ms };
  // Store in KV so other isolates pick it up; TTL matches the module-level cache.
  if (kv)
    await kv.put("policy:security", JSON.stringify(v), { expirationTtl: Math.ceil(POLICY_TTL_MS / 1000) });

  return v;
}

/**
 * Call this after any admin write that changes security settings
 * so the next request re-reads from D1 and repopulates both caches.
 * Deletes from KV so all isolates immediately see stale entry removed.
 */
export async function invalidatePolicyCache() {
  _policyCache = null;
  const kv = runtime().RATE_KV;
  if (kv) await kv.delete("policy:security");
}

// ---------------------------------------------------------------------------
// Actor resolution — resolves the ChatGPT identity to an app-level actor
// ---------------------------------------------------------------------------
export async function actor(
  req: Request,
  options: { skipSession?: boolean; forceLive?: boolean } = {},
): Promise<Actor> {
  const u = await getChatGPTUser();
  if (!u) throw new HttpError(401, "Sign in to access this workspace.");

  // Demo mode: only allowed when explicitly enabled OR live staff access is not yet open.
  // This prevents live operators from accidentally (or maliciously) entering demo mode
  // via a header/query-param trick.
  const demoRequested =
    !options.forceLive &&
    (req.headers.get("x-care-mode") === "demo" ||
      new URL(req.url).searchParams.get("mode") === "demo");

  const demoPermitted =
    runtime().DEMO_MODE_ENABLED === "true" ||
    runtime().STAFF_ACCESS_ENABLED !== "true";

  if (demoRequested && demoPermitted) {
    return {
      id: u.userId,
      name: u.displayName,
      role: "SUPER_ADMIN",
      tenant: "demo:" + u.userId,
      demo: true,
    };
  }

  // If demo was requested but not permitted, fall through to live auth.
  // Do NOT throw — just treat it as a normal live request.

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

  // ---------------------------------------------------------------------------
  // User row KV cache — avoids a D1 read on every authenticated request.
  // Cached for 5 minutes; invalidated on role/active changes in the `user` action.
  // ---------------------------------------------------------------------------
  const kv = runtime().RATE_KV;
  const userCacheKey = `user:${u.userId}`;
  if (!row && kv) {
    const cached = await kv.get(userCacheKey);
    if (cached) row = JSON.parse(cached);
  } else if (row && kv) {
    // Refresh the cache on every live read (keeps it warm)
    await kv.put(userCacheKey, JSON.stringify(row), { expirationTtl: 300 });
  }

  const bootstrapRole = isBootstrapAdmin(
    u.email,
    runtime().ADMIN_EMAIL,
    runtime().ADMIN_EMAILS,
  )
    ? "SUPER_ADMIN"
    : isBootstrapEmail(u.email, runtime().DOCTOR_ADMIN_EMAILS)
      ? "DOCTOR_ADMIN"
      : null;

  if (!row && bootstrapRole) {
    await db()
      .prepare(
        "INSERT OR IGNORE INTO users (id,email,name,role,active) VALUES (?,?,?,?,1)",
      )
      .bind(u.userId, u.email, u.displayName, bootstrapRole)
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

// ---------------------------------------------------------------------------
// RBAC helpers
// ---------------------------------------------------------------------------
export function requireRole(a: Actor, ...allow: string[]) {
  if (!a.demo && !hasRole(a.role, ...allow))
    throw new HttpError(403, "Your role cannot perform this action.");
}

export async function requirePermission(a: Actor, p: Permission) {
  if (!a.demo && !permitted(a.role, p)) {
    await log(a, "Access denied: " + p);
    throw new HttpError(403, "Your account cannot perform this action.");
  }
}

// ---------------------------------------------------------------------------
// Patient access — tenant-scoped with per-role data isolation
// ---------------------------------------------------------------------------
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

// ---------------------------------------------------------------------------
// Audit trail — HMAC-signed, append-only
// ---------------------------------------------------------------------------
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

export async function log(
  a: Actor,
  action: string,
  pid: string | null = null,
) {
  await (await auditStatement(a, action, pid)).run();
}

// ---------------------------------------------------------------------------
// Rate limiting
// Strategy: prefer Cloudflare KV (atomic, no D1 write contention).
// Falls back to D1 when RATE_KV is not bound (local dev / minimal deployments).
// Window: 120 requests per user per calendar minute.
// ---------------------------------------------------------------------------
export async function rateKey(
  key: string,
  limit = 120,
  windowSecs = 60,
  customMessage = "Please wait a minute before trying again.",
) {
  const kv = runtime().RATE_KV;

  if (kv) {
    // KV path — preferred; no D1 write, auto-expires, eventual consistency
    // acceptable for rate-limiting.
    const current = Number((await kv.get(key)) ?? "0");
    if (current >= limit)
      throw new HttpError(429, customMessage);
    // expirationTtl: twice the window covers overlap cleanly without manual GC sweeps.
    await kv.put(key, String(current + 1), { expirationTtl: Math.max(windowSecs * 2, 60) });
  } else {
    // D1 fallback — used in local dev when KV is not configured.
    const bucket = Math.floor(Date.now() / (windowSecs * 1000));
    const r = await db()
      .prepare(
        "INSERT INTO limits (id,count,expires) VALUES (?,1,?) ON CONFLICT(id) DO UPDATE SET count=count+1 RETURNING count",
      )
      .bind(key, bucket + 2)
      .first<any>();
    if (r && r.count > limit)
      throw new HttpError(429, customMessage);
    // Probabilistic GC: 1% of requests sweep expired rows.
    if (Math.random() < 0.01)
      await db()
        .prepare("DELETE FROM limits WHERE expires<?")
        .bind(bucket)
        .run();
  }
}

export async function rate(a: Actor) {
  const bucket = Math.floor(Date.now() / 60000);
  const key = `rl:${a.id}:${bucket}`;
  await rateKey(key, 120, 60);
}

// ---------------------------------------------------------------------------
// Standard JSON response — always no-store, always typed
// Attaches X-Request-Id for Cloudflare Logpush / tail worker correlation.
// ---------------------------------------------------------------------------
export function response(data: unknown, status = 200, requestId?: string) {
  const rid = requestId ?? id("REQ");
  return Response.json(data, {
    status,
    headers: {
      "Cache-Control": "no-store, private",
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "no-referrer",
      "X-Request-Id": rid,
    },
  });
}

// ---------------------------------------------------------------------------
// Structured error handler
// Discriminates error types, stores context in app_errors, and returns a
// request ID the client can quote when reporting issues.
// ---------------------------------------------------------------------------
export async function failure(
  e: unknown,
  req?: Request,
  actorId?: string,
): Promise<Response> {
  if (e instanceof HttpError) return response({ error: e.message }, e.status);

  if (e instanceof Error && e.name === "ZodError")
    return response(
      { error: "Please check the supplied fields and required values." },
      400,
    );

  // Unexpected error — log and return generic message with a trackable ID.
  const rid = id("ERR");
  const code =
    e instanceof SyntaxError
      ? "json_parse_error"
      : e instanceof TypeError
        ? "type_error"
        : "internal_error";
  const message =
    e instanceof Error ? e.message.slice(0, 300) : "Unknown error";
  const path = req ? new URL(req.url).pathname : "unknown";

  logEntry("ERROR", message, { rid, code, path, actorId });

  try {
    await db()
      .prepare(
        "INSERT INTO app_errors(id,at,code,message,path,actor) VALUES (?,?,?,?,?,?)",
      )
      .bind(rid, now(), code, message, path, actorId ?? null)
      .run();
    // Probabilistic GC: ~1% of error writes prune rows older than 7 days.
    // Keeps app_errors table from growing unboundedly under sustained load.
    if (Math.random() < 0.01) {
      const cutoff = new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString();
      await db()
        .prepare("DELETE FROM app_errors WHERE at < ?")
        .bind(cutoff)
        .run();
    }
  } catch {
    // D1 itself may be the cause — swallow to avoid masking the original error.
  }

  return response(
    {
      error:
        "The request could not be completed. Your unsaved input remains on this page.",
      requestId: rid,
    },
    500,
    rid,
  );
}

// ---------------------------------------------------------------------------
// Origin + content-type guard for mutating endpoints
// ---------------------------------------------------------------------------
export function originCheck(req: Request) {
  if (req.headers.get("origin") !== new URL(req.url).origin)
    throw new HttpError(403, "Request origin rejected.");
  if (!req.headers.get("content-type")?.includes("application/json"))
    throw new HttpError(415, "Expected JSON");
  if (Number(req.headers.get("content-length") || 0) > 100000)
    throw new HttpError(413, "Request too large.");
}

// ---------------------------------------------------------------------------
// Demo data seeding
// ---------------------------------------------------------------------------
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

// ---------------------------------------------------------------------------
// Append-only sample lifecycle event
// ---------------------------------------------------------------------------
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

// ---------------------------------------------------------------------------
// Cookie parsing
// ---------------------------------------------------------------------------
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

// ---------------------------------------------------------------------------
// Session validation — ATOMIC: single UPDATE RETURNING replaces 3 round-trips
//
// Old approach: SELECT (1 RTT) → check in JS → UPDATE (1 RTT) → check meta.changes
// New approach: UPDATE RETURNING (1 RTT) → check result
//
// Security is identical: the WHERE clause enforces all the same invariants
// (not revoked, not expired, not idle-timed-out, correct user) atomically.
// ---------------------------------------------------------------------------
export async function validateSession(req: Request, userId: string) {
  const token = sessionToken(req);
  if (!token)
    throw new HttpError(401, "Open your secure workspace to start a session.");

  const key = await hash(token);
  const time = Date.now();
  const policy = await securityPolicy(); // near-zero cost after cache is warm

  const row = await db()
    .prepare(
      `UPDATE app_sessions
       SET last_seen = ?
       WHERE token_hash = ?
         AND user_id    = ?
         AND revoked    = 0
         AND expires_at > ?
         AND last_seen  > ?
       RETURNING expires_at`,
    )
    .bind(
      time,
      key,
      userId,
      time,
      time - policy.idleMinutes * 60000,
    )
    .first<{ expires_at: number }>();

  if (!row)
    throw new HttpError(401, "Your session has expired. Sign in again.");

  // Additional absolute-session check — the RETURNING value lets us do this
  // without a separate SELECT.
  if (row.expires_at <= time)
    throw new HttpError(401, "Your session has expired. Sign in again.");
}
