import "server-only";
import { db, type Queryable } from "./db";
import { config } from "./config";
import { audit } from "./audit";
import { hasConsent } from "./services/common";
import { renderTemplate, NOTIFICATION_TEMPLATES, type NotificationTemplate } from "@/lib/shared/virtual";

// Patient notifications (PRD addendum §4). Messages are written to an outbox row inside the same
// transaction as the decision that triggers them, then sent by a dispatcher with retries.
// Message variables are derived at send time from the patient record and settings, so no
// message content (and never a login code) is stored. Messages never contain images,
// diagnoses or detailed medical information — only the approved template wording.

export const RETRY_DELAYS_SEC = [60, 5 * 60, 30 * 60, 2 * 60 * 60];
export const MAX_ATTEMPTS = RETRY_DELAYS_SEC.length + 1;

/** Templates that need review-notification consent (login codes are requested by the patient). */
const CONSENTED: NotificationTemplate[] = ["review_suspicious", "review_more_images", "review_no_lesion", "submission_received"];

export type SendResult = { ok: true; providerId: string } | { ok: false; retryable: boolean; error: string };
type Outgoing = { to: string; template: NotificationTemplate; params: string[]; text: string };

/** Test/dev outbox (console driver only). Holds the last messages so tests and local runs can read them. */
export const consoleOutbox: (Outgoing & { at: string })[] = [];

function paramsFor(t: NotificationTemplate, v: { name: string; clinic: string; phone: string; id: string; code?: string }): string[] {
  switch (t) {
    case "review_suspicious": return [v.name, v.clinic, v.phone];
    case "review_more_images": return [v.name, v.clinic];
    case "review_no_lesion": return [v.name];
    case "submission_received": return [v.name, v.id];
    case "login_code": return [v.code ?? ""];
  }
}

async function sendWhatsApp(m: Outgoing): Promise<SendResult> {
  const c = config();
  const components: unknown[] = [{ type: "body", parameters: m.params.map((text) => ({ type: "text", text })) }];
  // Authentication templates carry the code again on their copy-code button.
  if (m.template === "login_code") components.push({ type: "button", sub_type: "url", index: "0", parameters: [{ type: "text", text: m.params[0] }] });
  try {
    const res = await fetch(`https://graph.facebook.com/${c.WHATSAPP_API_VERSION}/${c.WHATSAPP_PHONE_NUMBER_ID}/messages`, {
      method: "POST",
      headers: { authorization: `Bearer ${c.WHATSAPP_TOKEN}`, "content-type": "application/json" },
      body: JSON.stringify({ messaging_product: "whatsapp", to: m.to, type: "template", template: { name: m.template, language: { code: c.WHATSAPP_TEMPLATE_LANGUAGE }, components } }),
      signal: AbortSignal.timeout(15_000),
    });
    const body = (await res.json().catch(() => ({}))) as { messages?: { id: string }[]; error?: { code?: number } };
    if (res.ok && body.messages?.[0]?.id) return { ok: true, providerId: body.messages[0].id };
    // 429 and 5xx are transient; other 4xx (bad number, template not approved) will not succeed on retry.
    return { ok: false, retryable: res.status === 429 || res.status >= 500, error: `http_${res.status}${body.error?.code ? `_${body.error.code}` : ""}` };
  } catch {
    return { ok: false, retryable: true, error: "network" };
  }
}

/** Free-form text reply (only allowed inside WhatsApp's 24-hour window after the patient writes). */
export async function sendWhatsAppText(to: string, text: string): Promise<void> {
  const c = config();
  if (c.NOTIFY_DRIVER !== "whatsapp") {
    if (c.isProd) return;
    consoleOutbox.push({ to, template: "submission_received", params: [], text, at: new Date().toISOString() });
    return;
  }
  await fetch(`https://graph.facebook.com/${c.WHATSAPP_API_VERSION}/${c.WHATSAPP_PHONE_NUMBER_ID}/messages`, {
    method: "POST",
    headers: { authorization: `Bearer ${c.WHATSAPP_TOKEN}`, "content-type": "application/json" },
    body: JSON.stringify({ messaging_product: "whatsapp", to, type: "text", text: { body: text } }),
    signal: AbortSignal.timeout(15_000),
  }).catch(() => {});
}

async function deliver(m: Outgoing): Promise<SendResult> {
  if (config().NOTIFY_DRIVER === "whatsapp") return sendWhatsApp(m);
  if (config().isProd) return { ok: false, retryable: false, error: "no_channel" }; // console driver never "sends" in production
  consoleOutbox.push({ ...m, at: new Date().toISOString() });
  if (consoleOutbox.length > 200) consoleOutbox.shift();
  // Never log message text in production-like environments; locally it helps testing.
  if (!config().isProd) console.log(`[notify:console] to=…${m.to.slice(-4)} template=${m.template} text="${m.text}"`);
  return { ok: true, providerId: `console-${crypto.randomUUID()}` };
}

/**
 * Queues a notification in the caller's transaction. Returns null (and records why) when the
 * patient has no mobile number or has not consented — the doctor then contacts them directly.
 */
export async function enqueueNotification(
  q: Queryable,
  n: { patientId: string; caseId?: string | null; template: Exclude<NotificationTemplate, "login_code">; idempotencyKey: string; createdBy?: string | null; correlationId: string },
): Promise<{ id: string } | { skipped: "no_mobile" | "no_consent" }> {
  const p = (await q.query<{ mobile: string | null }>("select mobile from patients where id = $1", [n.patientId])).rows[0];
  const reason = !p?.mobile ? "no_mobile" : CONSENTED.includes(n.template) && !(await hasConsent(q, n.patientId, "review_notifications")) ? "no_consent" : null;
  if (reason) {
    await audit({ actorType: n.createdBy ? "staff" : "system", actorId: n.createdBy ?? null, action: "notification.skipped", targetType: "patient", targetRef: n.patientId, outcome: "failure", correlationId: n.correlationId, code: reason, details: { template: n.template } }, q);
    return { skipped: reason };
  }
  const row = (await q.query<{ id: string }>(
    `insert into notifications (patient_id, case_id, template, channel, idempotency_key, created_by)
     values ($1, $2, $3, 'whatsapp', $4, $5) on conflict (idempotency_key) do update set updated_at = notifications.updated_at returning id`,
    [n.patientId, n.caseId ?? null, n.template, n.idempotencyKey, n.createdBy ?? null],
  )).rows[0]!;
  await audit({ actorType: n.createdBy ? "staff" : "system", actorId: n.createdBy ?? null, action: "notification.queued", targetType: "patient", targetRef: n.patientId, outcome: "success", correlationId: n.correlationId, details: { template: n.template } }, q);
  return row;
}

async function variablesFor(q: Queryable, patientId: string) {
  const p = (await q.query<{ full_name: string; mobile: string | null; display_id: string }>("select full_name, mobile, display_id from patients where id = $1", [patientId])).rows[0];
  const c = config();
  return p?.mobile ? { to: `91${p.mobile}`, name: p.full_name.split(/\s+/)[0]!, clinic: c.NOTIFY_CLINIC_NAME, phone: c.NOTIFY_CLINIC_PHONE, id: p.display_id } : null;
}

/** Sends due notifications. Safe to run concurrently: rows are claimed with SKIP LOCKED. */
export async function dispatchDue(limit = 20): Promise<number> {
  const d = await db();
  const claimed = (await d.query<{ id: string; patient_id: string; template: NotificationTemplate; attempts: number }>(
    `update notifications set status = 'sending', attempts = attempts + 1, updated_at = now()
      where id in (
        select id from notifications
         where template <> 'login_code'
           and ((status = 'queued' and next_attempt_at <= now())
             or (status = 'sending' and updated_at < now() - interval '10 minutes'))
         order by next_attempt_at limit $1 for update skip locked)
      returning id, patient_id, template, attempts`,
    [limit],
  )).rows;
  for (const n of claimed) {
    const v = await variablesFor(d, n.patient_id);
    let r: SendResult;
    if (!v) r = { ok: false, retryable: false, error: "no_mobile" };
    else if (CONSENTED.includes(n.template) && !(await hasConsent(d, n.patient_id, "review_notifications"))) r = { ok: false, retryable: false, error: "consent_withdrawn" };
    else {
      const params = paramsFor(n.template, v);
      r = await deliver({ to: v.to, template: n.template, params, text: renderTemplate(n.template, v) });
    }
    if (r.ok) {
      await d.query("update notifications set status = 'sent', provider_message_id = $2, last_error = null, updated_at = now() where id = $1", [n.id, r.providerId]);
    } else if (r.retryable && n.attempts < MAX_ATTEMPTS) {
      await d.query("update notifications set status = 'queued', last_error = $2, next_attempt_at = now() + make_interval(secs => $3), updated_at = now() where id = $1",
        [n.id, r.error, RETRY_DELAYS_SEC[n.attempts - 1] ?? RETRY_DELAYS_SEC.at(-1)]);
    } else {
      await d.query("update notifications set status = 'failed', last_error = $2, updated_at = now() where id = $1", [n.id, r.error]);
      await audit({ actorType: "system", action: "notification.failed", targetType: "patient", targetRef: n.patient_id, outcome: "failure", correlationId: crypto.randomUUID(), code: r.error.slice(0, 40), details: { template: n.template } });
    }
  }
  return claimed.length;
}

/** Sends a login code immediately. The code is never stored; on failure the patient asks again. */
export async function sendLoginCode(patientId: string, code: string): Promise<boolean> {
  const d = await db();
  const v = await variablesFor(d, patientId);
  if (!v) return false;
  const row = (await d.query<{ id: string }>(
    "insert into notifications (patient_id, template, channel, status, attempts, idempotency_key) values ($1, 'login_code', 'whatsapp', 'sending', 1, $2) returning id",
    [patientId, `otp-${crypto.randomUUID()}`],
  )).rows[0]!;
  let r: SendResult;
  try {
    r = await deliver({ to: v.to, template: "login_code", params: [code], text: renderTemplate("login_code", { code }) });
  } catch {
    r = { ok: false, retryable: false, error: "send_error" };
  }
  await d.query("update notifications set status = $2, provider_message_id = $3, last_error = $4, updated_at = now() where id = $1",
    [row.id, r.ok ? "sent" : "failed", r.ok ? r.providerId : null, r.ok ? null : r.error]);
  return r.ok;
}

/** Staff action: resend a failed message. */
export async function retryNotification(id: string): Promise<boolean> {
  const d = await db();
  const r = await d.query("update notifications set status = 'queued', next_attempt_at = now(), attempts = 0, updated_at = now() where id = $1 and status = 'failed' and template <> 'login_code' returning id", [id]);
  if (r.rows.length) kickDispatcher();
  return r.rows.length > 0;
}

/** Sends soon after a commit without blocking the request. */
export function kickDispatcher() {
  setTimeout(() => void dispatchDue().catch((e) => console.error("[notify] dispatch failed", (e as Error).message)), 0);
}

let worker: NodeJS.Timeout | undefined;
/** Background retry loop (started once per server process from instrumentation.ts). */
export function startNotificationWorker(intervalMs = 20_000) {
  if (worker) return;
  worker = setInterval(() => void dispatchDue().catch(() => {}), intervalMs);
  worker.unref();
}

export const TEMPLATE_LABELS = Object.fromEntries(Object.entries(NOTIFICATION_TEMPLATES).map(([k, v]) => [k, v.label])) as Record<NotificationTemplate, string>;
