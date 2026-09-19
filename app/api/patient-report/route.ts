import {
  actor,
  db,
  patient,
  requirePermission,
  log,
  rate,
  response,
  failure,
  HttpError,
} from "@/lib/server";
export const dynamic = "force-dynamic";
const esc = (v: unknown) =>
  String(v ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ]!,
  );
export async function GET(req: Request) {
  try {
    const a = await actor(req);
    await requirePermission(a, "reports.patient");
    await rate(a);
    const pid = new URL(req.url).searchParams.get("patient");
    if (!pid) throw new HttpError(400, "Choose a patient.");
    const p = await patient(a, pid);
    const records = (
      await db()
        .prepare(
          "SELECT kind,status,at,data FROM records WHERE patient_id=? ORDER BY at DESC",
        )
        .bind(pid)
        .all<any>()
    ).results.map((r) => ({ ...r, data: JSON.parse(r.data) }));
    const responses = (
      await db()
        .prepare(
          "SELECT question_text,answer,version,at FROM responses WHERE patient_id=? ORDER BY at",
        )
        .bind(pid)
        .all()
    ).results;
    const samples = (
      await db()
        .prepare(
          "SELECT id,type,status,collected_at FROM samples WHERE patient_id=?",
        )
        .bind(pid)
        .all()
    ).results;
    const reports = (
      await db()
        .prepare(
          "SELECT id,sample_id,filename,status,at FROM reports WHERE patient_id=?",
        )
        .bind(pid)
        .all()
    ).results;
    await log(a, "Patient-specific report generated", pid);
    if (new URL(req.url).searchParams.get("format") === "html") {
      const table = (rows: any[]) =>
        rows.length
          ? rows
              .map(
                (r) =>
                  `<article>${Object.entries(r)
                    .map(
                      ([k, v]) =>
                        `<p><strong>${esc(k)}:</strong> ${esc(typeof v === "object" ? JSON.stringify(v) : v)}</p>`,
                    )
                    .join("")}</article>`,
              )
              .join("")
          : "<p>No records recorded.</p>";
      const html = `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Patient report ${esc(pid)}</title><style>body{font:15px/1.6 Arial,sans-serif;max-width:900px;margin:30px auto;padding:20px;color:#183e35}h1{font-size:25px}article{border-bottom:1px solid #ddd;padding:14px 0;break-inside:avoid}p{overflow-wrap:anywhere}button{padding:12px;margin:15px 0}@media print{button,.instructions{display:none}body{margin:0;padding:0}}</style><h1>Telangana Against Oral Cancer · Patient report</h1><p>Confidential · ${esc(new Date().toISOString())}${a.demo ? " · SYNTHETIC DEMONSTRATION" : ""}</p><p><strong>${esc(p.name)}</strong> · ${esc(pid)} · Age ${esc(p.age)}</p><p class="instructions">Use your browser’s Print command to print or save as PDF. Store only in an authorised location.</p><h2>Clinical history</h2>${table(records)}<h2>Questionnaire history</h2>${table(responses)}<h2>Samples</h2>${table(samples)}<h2>Laboratory reports</h2>${table(reports)}<p>Screening findings are not a confirmed cancer diagnosis. Laboratory files are available through the authorised patient record.</p></html>`;
      return new Response(html, {
        headers: {
          "Content-Type": "text/html; charset=utf-8",
          "Cache-Control": "no-store, private",
          "Content-Security-Policy":
            "default-src 'none'; style-src 'unsafe-inline'; frame-ancestors 'none'",
        },
      });
    }
    return response({
      generatedAt: new Date().toISOString(),
      patient: { id: p.id, name: p.name, age: p.age },
      records,
      responses,
      samples,
      reports,
    });
  } catch (e) {
    return failure(e);
  }
}
