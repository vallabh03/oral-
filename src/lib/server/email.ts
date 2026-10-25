import "server-only";
import { config } from "./config";

export type Email = { to: string; subject: string; text: string; replyTo?: string };
export type SendResult = { ok: true } | { ok: false; category: "timeout" | "rejected" | "provider_error" | "not_configured" };

/** Removes CR/LF so user input can never inject extra mail headers. */
export function headerSafe(s: string): string {
  return s.replace(/[\r\n]+/g, " ").trim().slice(0, 200);
}

const sent: Email[] = [];
/** Dev/test outbox (console driver only). */
export function devOutbox(): readonly Email[] {
  return sent;
}

export async function sendEmail(e: Email): Promise<SendResult> {
  const c = config();
  const msg: Email = { ...e, subject: headerSafe(e.subject), replyTo: e.replyTo ? headerSafe(e.replyTo) : undefined };
  if (c.EMAIL_DRIVER === "console") {
    sent.push(msg);
    if (!c.isProd && process.env.APP_ENV !== "test") console.info(`[email:dev] to=${msg.to} subject="${msg.subject}"`);
    return { ok: true };
  }
  try {
    const { SESv2Client, SendEmailCommand } = await import("@aws-sdk/client-sesv2");
    const client = new SESv2Client({ region: c.SES_REGION || c.AWS_REGION, requestHandler: { requestTimeout: 8000 } as never });
    await client.send(
      new SendEmailCommand({
        FromEmailAddress: c.EMAIL_FROM,
        Destination: { ToAddresses: [msg.to] },
        ReplyToAddresses: msg.replyTo ? [msg.replyTo] : undefined,
        Content: { Simple: { Subject: { Data: msg.subject }, Body: { Text: { Data: msg.text } } } },
      }),
    );
    return { ok: true };
  } catch (err) {
    const name = (err as { name?: string }).name ?? "";
    return { ok: false, category: /Timeout|Abort/i.test(name) ? "timeout" : /Reject|MessageRejected/i.test(name) ? "rejected" : "provider_error" };
  }
}
