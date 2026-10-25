import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { handler } from "@/lib/server/http";
import { config, whatsappConfigured } from "@/lib/server/config";
import { db } from "@/lib/server/db";
import { audit } from "@/lib/server/audit";
import { AppError } from "@/lib/server/errors";
import { verifyWebhookSignature } from "@/lib/server/webhook";

const STATUS_ORDER = ["submitted", "accepted", "delivered", "read"] as const;

const payload = z.object({
  entry: z.array(z.object({ changes: z.array(z.object({ value: z.object({ statuses: z.array(z.object({ id: z.string().max(200), status: z.string().max(20) })).optional() }).passthrough() })) })).max(50),
}).passthrough();

export const POST = handler({ auth: "public", rawBody: true, csrf: false }, async ({ req, correlationId }) => {
  if (!whatsappConfigured()) throw new AppError(404, "not_found", "Not found.");
  const raw = await req.text();
  if (raw.length > 256 * 1024) throw new AppError(413, "payload_too_large", "Too large.");
  if (!verifyWebhookSignature(raw, req.headers.get("x-hub-signature-256"), config().WHATSAPP_APP_SECRET!)) {
    await audit({ actorType: "anonymous", action: "webhook.whatsapp", outcome: "denied", correlationId, code: "bad_signature" });
    throw new AppError(401, "bad_signature", "Invalid signature.");
  }
  const body = payload.parse(JSON.parse(raw));
  const d = await db();
  for (const s of body.entry.flatMap((e) => e.changes.flatMap((c) => c.value.statuses ?? []))) {
    const next = s.status === "failed" ? "failed" : (STATUS_ORDER as readonly string[]).includes(s.status) ? s.status : null;
    if (!next) continue;
    // Idempotent & monotonic: retries and out-of-order callbacks never move status backwards.
    await d.query(
      `update whatsapp_messages set status = $2, updated_at = now()
        where provider_message_id = $1 and status <> 'failed'
          and (array_position(array['submitted','accepted','delivered','read'], $2) > array_position(array['submitted','accepted','delivered','read'], status) or $2 = 'failed')`,
      [s.id, next],
    );
  }
  return new NextResponse(null, { status: 200 });
});

// Meta subscription verification handshake.
export const GET = handler({ auth: "public" }, async ({ req }) => {
  if (!whatsappConfigured()) throw new AppError(404, "not_found", "Not found.");
  const p = req.nextUrl.searchParams;
  const expected = crypto.createHmac("sha256", config().WHATSAPP_APP_SECRET!).update("verify-token").digest("hex").slice(0, 32);
  if (p.get("hub.mode") === "subscribe" && p.get("hub.verify_token") === expected) return new NextResponse(p.get("hub.challenge") ?? "", { status: 200 });
  throw new AppError(403, "forbidden", "Forbidden.");
});
