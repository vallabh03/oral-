import "server-only";
import { db, type Queryable } from "./db";
import { hmac } from "./security/crypto";

export type AuditEvent = {
  actorType: "staff" | "participant" | "system" | "anonymous";
  actorId?: string | null;
  action: string;
  targetType?: string;
  targetRef?: string | null;
  outcome: "success" | "denied" | "failure";
  correlationId: string;
  code?: string;
  details?: Record<string, unknown>;
  isDemo?: boolean;
};

// Keys that must never reach the audit store (PHI, secrets).
const FORBIDDEN_KEYS = /name|mobile|phone|email|note|token|password|secret|answer|address|photo_data|otp|code_value/i;

export function redact(details: Record<string, unknown> = {}): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(details)) {
    if (FORBIDDEN_KEYS.test(k)) continue;
    if (v === null || ["string", "number", "boolean"].includes(typeof v)) out[k] = typeof v === "string" ? v.slice(0, 200) : v;
    else if (Array.isArray(v)) out[k] = v.filter((x) => ["string", "number", "boolean"].includes(typeof x)).slice(0, 20);
  }
  return out;
}

const GENESIS = "genesis";

// jsonb reorders keys, so details are serialised with sorted keys for a stable MAC.
function sortedJson(v: unknown): string {
  if (Array.isArray(v)) return "[" + v.map(sortedJson).join(",") + "]";
  if (v && typeof v === "object") {
    return "{" + Object.keys(v).sort().map((k) => JSON.stringify(k) + ":" + sortedJson((v as Record<string, unknown>)[k])).join(",") + "}";
  }
  return JSON.stringify(v ?? null);
}

function canonical(e: { occurred_at: string; actor_type: string; actor_id: string | null; action: string; target_type: string | null; target_ref: string | null; outcome: string; correlation_id: string; code: string | null; details: unknown; is_demo: boolean }) {
  return JSON.stringify([e.occurred_at, e.actor_type, e.actor_id, e.action, e.target_type, e.target_ref, e.outcome, e.correlation_id, e.code, sortedJson(e.details), e.is_demo]);
}

/** Appends a tamper-evident audit event (HMAC chain). Pass `q` to join the caller's transaction. */
export async function audit(e: AuditEvent, q?: Queryable): Promise<void> {
  const run = async (t: Queryable) => {
    await t.query("select pg_advisory_xact_lock(7243001)");
    const prev = (await t.query<{ hmac: string }>("select hmac from audit_events order by seq desc limit 1")).rows[0]?.hmac ?? GENESIS;
    const now = (await t.query<{ ts: string }>("select to_char(clock_timestamp() at time zone 'UTC', 'YYYY-MM-DD\"T\"HH24:MI:SS.US\"Z\"') as ts")).rows[0]!.ts;
    const row = {
      occurred_at: now,
      actor_type: e.actorType,
      actor_id: e.actorId ?? null,
      action: e.action,
      target_type: e.targetType ?? null,
      target_ref: e.targetRef ?? null,
      outcome: e.outcome,
      correlation_id: e.correlationId,
      code: e.code ?? null,
      details: redact(e.details),
      is_demo: !!e.isDemo,
    };
    const mac = hmac(prev + "|" + canonical(row));
    await t.query(
      `insert into audit_events (occurred_at, actor_type, actor_id, action, target_type, target_ref, outcome, correlation_id, code, details, is_demo, prev_hmac, hmac)
       values ($1::timestamptz,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb,$11,$12,$13)`,
      [row.occurred_at, row.actor_type, row.actor_id, row.action, row.target_type, row.target_ref, row.outcome, row.correlation_id, row.code, JSON.stringify(row.details), row.is_demo, prev, mac],
    );
  };
  if (q) return run(q);
  const d = await db();
  await d.tx(run);
}

/** Recomputes the chain. Returns the first broken sequence number, or null if intact. */
export async function verifyAuditChain(): Promise<{ ok: boolean; checked: number; brokenAt: number | null }> {
  const d = await db();
  const rows = (
    await d.query<{
      seq: number; occurred_at: string; actor_type: string; actor_id: string | null; action: string; target_type: string | null; target_ref: string | null;
      outcome: string; correlation_id: string; code: string | null; details: unknown; is_demo: boolean; prev_hmac: string; hmac: string;
    }>(
      `select seq, to_char(occurred_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') as occurred_at, actor_type, actor_id, action, target_type, target_ref,
              outcome, correlation_id, code, details, is_demo, prev_hmac, hmac from audit_events order by seq`,
    )
  ).rows;
  let prev = GENESIS;
  for (const r of rows) {
    const expected = hmac(prev + "|" + canonical({ ...r, details: typeof r.details === "string" ? JSON.parse(r.details) : r.details }));
    if (r.prev_hmac !== prev || r.hmac !== expected) return { ok: false, checked: rows.length, brokenAt: Number(r.seq) };
    prev = r.hmac;
  }
  return { ok: true, checked: rows.length, brokenAt: null };
}
