import { z } from "zod";
import { actor, auditStatement, boundedBody, db, failure, HttpError, originCheck, patient, rate, response, runtime } from "@/lib/server";
import { screeningPdf } from "@/lib/report-pdf";

export const dynamic = "force-dynamic";

function setupReady() {
  const e = runtime();
  return e.WHATSAPP_ENABLED === "true" && !!e.WHATSAPP_PHONE_NUMBER_ID &&
    !!e.WHATSAPP_ACCESS_TOKEN && !!e.WHATSAPP_REPORT_TEMPLATE_NAME &&
    !!e.WHATSAPP_TEMPLATE_LANGUAGE && !!e.WHATSAPP_GRAPH_VERSION;
}
function recipient(phone: string) {
  const digits = phone.replace(/[^0-9]/g, "");
  const normalized = digits.length === 10 ? "91" + digits : digits;
  if (!/^91[6-9][0-9]{9}$/.test(normalized))
    throw new HttpError(409, "A valid Indian mobile number is required for WhatsApp delivery.");
  return normalized;
}
async function checkedPatient(req: Request, pid: string) {
  const a = await actor(req);
  if (!a.demo && a.role !== "DOCTOR_ADMIN")
    throw new HttpError(403, "Only a Doctor Admin can send patient reports.");
  await rate(a);
  const p = await patient(a, pid);
  const exam = await db().prepare(
    "SELECT data,at FROM records WHERE patient_id=? AND kind='assessment' AND status='Clinician verified' ORDER BY at DESC LIMIT 1",
  ).bind(pid).first<any>();
  if (!exam || !p.category)
    throw new HttpError(409, "A clinician-verified oral examination is required before reporting.");
  exam.data = JSON.parse(exam.data);
  const consent = await db().prepare(
    "SELECT status FROM consents WHERE patient_id=? AND type='whatsapp_report' ORDER BY rowid DESC LIMIT 1",
  ).bind(pid).first<any>();
  return { a, p, exam, consented: consent?.status === "granted" };
}

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const pid = z.string().min(1).max(80).parse(url.searchParams.get("patient"));
    const { a, p, exam, consented } = await checkedPatient(req, pid);
    if (url.searchParams.get("format") === "pdf") {
      const pdf = await screeningPdf(p, exam);
      await (await auditStatement(a, "Screening PDF previewed", pid)).run();
      return new Response(pdf as BodyInit, { headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": "inline; filename=DRIVE-SAFE-screening-report.pdf",
        "Cache-Control": "no-store, private",
        "X-Content-Type-Options": "nosniff",
        "Referrer-Policy": "no-referrer",
      }});
    }
    return response({
      configured: !a.demo && setupReady(),
      consented,
      mobileEnding: p.phone ? String(p.phone).replace(/[^0-9]/g, "").slice(-4) : null,
      previewAvailable: true,
    });
  } catch (e) { return failure(e); }
}

export async function POST(req: Request) {
  try {
    originCheck(req);
    const payload = z.object({ patientId: z.string().min(1).max(80), confirm: z.literal(true) })
      .parse(JSON.parse(new TextDecoder().decode(await boundedBody(req, 1024))));
    const { a, p, exam, consented } = await checkedPatient(req, payload.patientId);
    if (a.demo) throw new HttpError(403, "WhatsApp sending is unavailable in demonstration mode.");
    if (!setupReady()) throw new HttpError(503, "WhatsApp Business delivery is not configured.");
    if (!consented) throw new HttpError(409, "Specific WhatsApp report consent is required.");
    if (!p.contact_intended) throw new HttpError(409, "The participant has not agreed to follow-up contact.");
    const to = recipient(p.phone);
    const e = runtime();
    if (!/^v\d+\.\d+$/.test(e.WHATSAPP_GRAPH_VERSION!) || !/^\d+$/.test(e.WHATSAPP_PHONE_NUMBER_ID!))
      throw new HttpError(503, "WhatsApp Business configuration is invalid.");
    const throttle = await db().prepare(
      "INSERT INTO limits (id,count,expires) VALUES (?,1,?) ON CONFLICT(id) DO UPDATE SET count=count+1 RETURNING count",
    ).bind(`whatsapp:${p.id}:${Math.floor(Date.now() / 900000)}`, Math.floor(Date.now() / 60000) + 30).first<any>();
    if (throttle.count > 1) throw new HttpError(429, "A report was recently submitted for this participant. Check delivery before retrying.");
    const pdf = await screeningPdf(p, exam);
    const root = `https://graph.facebook.com/${e.WHATSAPP_GRAPH_VERSION}`;
    const authorization = { Authorization: `Bearer ${e.WHATSAPP_ACCESS_TOKEN}` };
    const form = new FormData();
    form.set("messaging_product", "whatsapp");
    form.set("file", new File([pdf as BlobPart], "DRIVE-SAFE-screening-report.pdf", { type: "application/pdf" }));
    const uploaded = await fetch(`${root}/${e.WHATSAPP_PHONE_NUMBER_ID}/media`, { method: "POST", headers: authorization, body: form });
    const media: any = await uploaded.json().catch(() => ({}));
    if (!uploaded.ok || typeof media.id !== "string")
      throw new HttpError(502, "WhatsApp did not accept the report document. No message was submitted.");
    const sent = await fetch(`${root}/${e.WHATSAPP_PHONE_NUMBER_ID}/messages`, {
      method: "POST", headers: { ...authorization, "Content-Type": "application/json" },
      body: JSON.stringify({
        messaging_product: "whatsapp", to, type: "template",
        template: { name: e.WHATSAPP_REPORT_TEMPLATE_NAME, language: { code: e.WHATSAPP_TEMPLATE_LANGUAGE },
          components: [{ type: "header", parameters: [{ type: "document", document: { id: media.id, filename: "DRIVE-SAFE-screening-report.pdf" } }] }] },
      }),
    });
    const result: any = await sent.json().catch(() => ({}));
    if (!sent.ok || !result.messages?.[0]?.id) {
      await fetch(`${root}/${media.id}`, { method: "DELETE", headers: authorization }).catch(() => {});
      throw new HttpError(502, "WhatsApp did not accept the report message. Check the approved template and account settings.");
    }
    await (await auditStatement(a, `Screening PDF submitted to WhatsApp; destination ends ${to.slice(-4)}; message ${result.messages[0].id}`, p.id)).run();
    return response({ submitted: true, mobileEnding: to.slice(-4), deliveryConfirmed: false });
  } catch (e) { return failure(e); }
}
