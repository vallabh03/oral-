import { hasRole } from "@/lib/domain";
import { actor, db, runtime, patient, log, rate, failure, HttpError } from "@/lib/server";
export const dynamic = "force-dynamic";
export async function POST(req: Request) {
  try {
    await actor(req);
    throw new HttpError(410, "Laboratory report upload is retired. Historical files are retained.");
  } catch (e) { return failure(e, req); }
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
      // Only lab and administrative/doctor-admin staff handle reports before
      // verification; everyone else sees verified, linked reports only.
      if (!hasRole(a.role, "ADMIN", "LAB") && r.status !== "Linked")
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
    return failure(e, req);
  }
}
