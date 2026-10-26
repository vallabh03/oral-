import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { handler } from "@/lib/server/http";
import { config, whatsappConfigured } from "@/lib/server/config";
import { db } from "@/lib/server/db";
import { audit } from "@/lib/server/audit";
import { AppError } from "@/lib/server/errors";
import { verifyWebhookSignature } from "@/lib/server/webhook";
import { enforceRateLimit } from "@/lib/server/security/rateLimit";
import { hashToken } from "@/lib/server/security/crypto";
import { sendWhatsAppText } from "@/lib/server/notify";
import { withdrawConsent } from "@/lib/server/services/participants";
import { currentConsents } from "@/lib/server/services/common";

const STATUS_ORDER = ["submitted", "accepted", "delivered", "read"] as const;
const NOTIFY_ORDER = ["queued", "sending", "sent", "delivered", "read"] as const;
const STOP_WORDS = /^\s*(stop|unsubscribe|stop all|cancel|band karo|ఆపు)\s*$/i;

const payload = z.object({
  entry: z.array(z.object({ changes: z.array(z.object({ value: z.object({
    statuses: z.array(z.object({ id: z.string().max(200), status: z.string().max(20) })).optional(),
    messages: z.array(z.object({ from: z.string().max(20), type: z.string().max(20), text: z.object({ body: z.string().max(4096) }).optional() })).optional(),
  }).passthrough() })) })).max(50),
}).passthrough();

/** Reads the body but stops as soon as it exceeds the cap (before the signature is checked). */
async function readCapped(req: Request, max: number): Promise<string> {
  if (Number(req.headers.get("content-length") ?? "0") > max || !req.body) {
    if (!req.body) return "";
    throw new AppError(413, "payload_too_large", "Too large.");
  }
  const reader = req.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > max) {
      await reader.cancel().catch(() => {});
      throw new AppError(413, "payload_too_large", "Too large.");
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks).toString("utf8");
}

const enabled = () => whatsappConfigured() || config().NOTIFY_DRIVER === "whatsapp";

export const POST = handler({ auth: "public", rawBody: true, csrf: false }, async ({ req, correlationId }) => {
  if (!enabled()) throw new AppError(404, "not_found", "Not found.");
  const raw = await readCapped(req, 256 * 1024);
  if (!verifyWebhookSignature(raw, req.headers.get("x-hub-signature-256"), config().WHATSAPP_APP_SECRET!)) {
    await audit({ actorType: "anonymous", action: "webhook.whatsapp", outcome: "denied", correlationId, code: "bad_signature" });
    throw new AppError(401, "bad_signature", "Invalid signature.");
  }
  const body = payload.parse(JSON.parse(raw));
  const d = await db();
  const values = body.entry.flatMap((e) => e.changes.map((c) => c.value));
  for (const s of values.flatMap((v) => v.statuses ?? [])) {
    const next = s.status === "failed" ? "failed" : (STATUS_ORDER as readonly string[]).includes(s.status) ? s.status : null;
    if (next) {
      // Idempotent & monotonic: retries and out-of-order callbacks never move status backwards.
      await d.query(
        `update whatsapp_messages set status = $2, updated_at = now()
          where provider_message_id = $1 and status <> 'failed'
            and (array_position(array['submitted','accepted','delivered','read'], $2) > array_position(array['submitted','accepted','delivered','read'], status) or $2 = 'failed')`,
        [s.id, next],
      );
    }
    const n = s.status === "failed" ? "failed" : (NOTIFY_ORDER as readonly string[]).includes(s.status) ? s.status : null;
    if (n) {
      await d.query(
        `update notifications set status = $2, last_error = case when $2 = 'failed' then 'delivery_failed' else last_error end, updated_at = now()
          where provider_message_id = $1 and status not in ('failed', 'cancelled')
            and (array_position(array['queued','sending','sent','delivered','read'], $2) > array_position(array['queued','sending','sent','delivered','read'], status) or $2 = 'failed')`,
        [s.id, n],
      );
    }
  }
  // Replies: STOP opts the patient out of messages; anything else gets one automatic pointer to
  // the clinic (at most once a day per number). Message content is never stored.
  for (const m of values.flatMap((v) => v.messages ?? [])) {
    const mobile = m.from.replace(/^91/, "");
    if (!/^[6-9]\d{9}$/.test(mobile)) continue;
    const patients = (await d.query<{ id: string }>("select id from patients where mobile = $1 and status <> 'withdrawn'", [mobile])).rows;
    const stop = m.type === "text" && STOP_WORDS.test(m.text?.body ?? "");
    if (stop) {
      for (const p of patients) {
        const c = await currentConsents(d, p.id);
        for (const type of ["review_notifications", "whatsapp_report"] as const) {
          if (c[type]?.status === "granted") await withdrawConsent(p.id, type, { type: "participant", intakeSessionId: "whatsapp-stop" }, correlationId).catch(() => {});
        }
      }
      await audit({ actorType: "participant", action: "whatsapp.opt_out", outcome: "success", correlationId, details: { matched: patients.length } });
      await sendWhatsAppText(m.from, "You will no longer receive messages from us here. To start again, contact the programme team.");
      continue;
    }
    try {
      await enforceRateLimit({ name: "wa-autoreply", max: 1, windowSec: 24 * 60 * 60 }, hashToken(m.from));
    } catch {
      continue;
    }
    await audit({ actorType: "participant", action: "whatsapp.inbound", outcome: "success", correlationId, details: { matched: patients.length } });
    await sendWhatsAppText(m.from, `This number does not read replies. For help, please contact ${config().NOTIFY_CLINIC_NAME} at ${config().NOTIFY_CLINIC_PHONE}. Reply STOP to stop messages.`);
  }
  return new NextResponse(null, { status: 200 });
});

// Meta subscription verification handshake.
export const GET = handler({ auth: "public" }, async ({ req }) => {
  if (!enabled()) throw new AppError(404, "not_found", "Not found.");
  const p = req.nextUrl.searchParams;
  const expected = crypto.createHmac("sha256", config().WHATSAPP_APP_SECRET!).update("verify-token").digest("hex").slice(0, 32);
  if (p.get("hub.mode") === "subscribe" && p.get("hub.verify_token") === expected) return new NextResponse(p.get("hub.challenge") ?? "", { status: 200 });
  throw new AppError(403, "forbidden", "Forbidden.");
});
