import { hasRole } from "@/lib/domain";
import {
  actor,
  db,
  runtime,
  id,
  now,
  patient,
  auditStatement,
  log,
  rate,
  response,
  failure,
  HttpError,
  boundedBody,
} from "@/lib/server";
export const dynamic = "force-dynamic";
export async function POST(req: Request) {
  try {
    if (req.headers.get("origin") !== new URL(req.url).origin)
      throw new HttpError(403, "Request origin rejected.");
    const a = await actor(req);
    if (!a.demo && !hasRole(a.role, "ADMIN", "LAB"))
      throw new HttpError(403, "Report upload requires laboratory access.");
    await rate(a);
    if (Number(req.headers.get("content-length") || 0) > 5_500_000)
      throw new HttpError(413, "Report limit is 5 MB.");
    const form = await new Response(await boundedBody(req, 5_500_000), {
        headers: { "Content-Type": req.headers.get("content-type") || "" },
      }).formData(),
      pid = String(form.get("patientId")),
      sid = String(form.get("sampleId"));
    const p = await patient(a, pid);
    const s = await db()
      .prepare("SELECT * FROM samples WHERE id=? AND patient_id=?")
      .bind(sid, pid)
      .first<any>();
    if (!s || (!a.demo && a.role === "LAB" && s.lab_id !== a.id))
      throw new HttpError(404, "Sample unavailable.");
    if (s.status !== "Processing")
      throw new HttpError(
        409,
        "The sample must be processing before a report can be uploaded.",
      );
    if (
      form.get("confirm") !== "true" ||
      form.get("patientName") !== p.name ||
      form.get("sampleType") !== s.type
    )
      throw new HttpError(
        400,
        "Confirm all patient and sample details before uploading.",
      );
    const f = form.get("file");
    if (!(f instanceof File) || f.size > 5_000_000 || f.size < 5)
      throw new HttpError(400, "Select a PDF up to 5 MB.");
    const bytes = await f.arrayBuffer();
    if (new TextDecoder().decode(bytes.slice(0, 5)) !== "%PDF-")
      throw new HttpError(400, "Only PDF reports are accepted.");
    const rid = id("RPT"),
      key = a.tenant + "/" + rid + ".pdf";
    await runtime().BUCKET.put(key, bytes, {
      httpMetadata: { contentType: "application/pdf" },
    });
    try {
      await db().batch([
        db()
          .prepare(
            "INSERT INTO reports (id,sample_id,patient_id,object_key,filename,status,uploaded_by,at) VALUES (?,?,?,?,?,?,?,?)",
          )
          .bind(
            rid,
            sid,
            pid,
            key,
            "Laboratory report.pdf",
            "Uploaded",
            a.id,
            now(),
          ),
        db()
          .prepare(
            "UPDATE samples SET status='Report generated',revision=revision+1 WHERE id=? AND status='Processing'",
          )
          .bind(sid),
        await auditStatement(
          a,
          "Report uploaded to private storage: " + rid,
          pid,
        ),
      ]);
    } catch (e) {
      await runtime().BUCKET.delete(key);
      throw e;
    }
    return response({ id: rid });
  } catch (e) {
    return failure(e);
  }
}
export async function GET(req: Request) {
  try {
    const a = await actor(req);
    await rate(a);
    const rid = new URL(req.url).searchParams.get("id");
    const r = await db()
      .prepare(
        "SELECT r.*,p.tenant,s.lab_id FROM reports r JOIN patients p ON p.id=r.patient_id JOIN samples s ON s.id=r.sample_id WHERE r.id=? AND p.tenant=?",
      )
      .bind(rid, a.tenant)
      .first<any>();
    if (!r) throw new HttpError(404, "Report unavailable.");
    await patient(a, r.patient_id);
    if (!a.demo) {
      if (!hasRole(a.role, "ADMIN", "LAB", "DOCTOR", "PATIENT", "ASSISTANT"))
        throw new HttpError(403, "Report access denied.");
      if (a.role === "LAB" && r.lab_id !== a.id)
        throw new HttpError(404, "Report unavailable.");
      if (["DOCTOR", "PATIENT"].includes(a.role) && r.status !== "Linked")
        throw new HttpError(
          403,
          "Only verified, linked reports can be viewed.",
        );
    }
    const obj = await runtime().BUCKET.get(r.object_key);
    if (!obj) throw new HttpError(404, "Report unavailable.");
    await log(a, "Report downloaded: " + rid, r.patient_id);
    return new Response(obj.body, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": 'attachment; filename="verified-report.pdf"',
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
        "Content-Security-Policy": "default-src 'none'; sandbox",
        "Referrer-Policy": "no-referrer",
      },
    });
  } catch (e) {
    return failure(e);
  }
}
