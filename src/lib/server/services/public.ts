import "server-only";
import { z } from "zod";
import { db } from "../db";
import { config } from "../config";
import { audit } from "../audit";
import { headerSafe, sendEmail } from "../email";
import type { contactSchema, eventSchema } from "../schemas";
import { ANALYTICS_EVENTS, sanitizeTrackedPath, sanitizeUtmValue } from "@/lib/shared/analytics";
import { CONTACT_TOPICS } from "@/lib/shared/constants";

/**
 * Contact form → stored message → programme mailbox notification (FR-PUB-18, FR-OPS-07).
 * Idempotent per submission key; the delivery outcome is recorded as a category only.
 */
export async function submitContact(input: z.infer<typeof contactSchema>, correlationId: string) {
  const d = await db();
  const inserted = (await d.query<{ id: string }>(
    `insert into contact_messages (idempotency_key, name, email, topic, message) values ($1, $2, $3, $4, $5)
     on conflict (idempotency_key) do nothing returning id`,
    [input.idempotencyKey, input.name, input.email, input.topic, input.message],
  )).rows[0];
  if (!inserted) {
    const prior = (await d.query<{ email_status: string }>("select email_status from contact_messages where idempotency_key = $1", [input.idempotencyKey])).rows[0];
    return { ok: true, replayed: true, delivered: prior?.email_status === "sent" };
  }
  const topic = CONTACT_TOPICS.find((t) => t.value === input.topic)?.label ?? input.topic;
  const result = await sendEmail({
    to: config().CONTACT_TO_EMAIL,
    subject: `[Website] ${topic} — ${headerSafe(input.name)}`,
    replyTo: input.email,
    // Plain text only; the body is never rendered as HTML.
    text: `New website enquiry\n\nTopic: ${topic}\nFrom: ${input.name} <${input.email}>\nReference: ${inserted.id}\n\n${input.message}\n`,
  });
  await d.query("update contact_messages set email_status = $2, email_error_category = $3 where id = $1", [inserted.id, result.ok ? "sent" : "failed", result.ok ? null : result.category]);
  await audit({ actorType: "anonymous", action: "contact.submit", targetType: "contact", targetRef: inserted.id, outcome: result.ok ? "success" : "failure", correlationId, code: result.ok ? undefined : result.category });
  return { ok: true, replayed: false, delivered: result.ok };
}

/** Records an allowlisted, consented, PII-free conversion event. Anything else is dropped. */
export async function recordEvent(input: z.infer<typeof eventSchema>): Promise<boolean> {
  if (!(ANALYTICS_EVENTS as readonly string[]).includes(input.name)) return false;
  const path = sanitizeTrackedPath(input.path);
  if (!path) return false;
  const d = await db();
  await d.query("insert into analytics_events (name, path, utm_source, utm_medium, utm_campaign) values ($1, $2, $3, $4, $5)", [
    input.name, path, sanitizeUtmValue(input.utm_source) ?? null, sanitizeUtmValue(input.utm_medium) ?? null, sanitizeUtmValue(input.utm_campaign) ?? null,
  ]);
  return true;
}
