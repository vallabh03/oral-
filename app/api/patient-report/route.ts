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
import { translate } from "@/lib/i18n";
import { languages, isLocale, localeInfo } from "@/lib/i18n/languages";
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
    const requestedLocale = new URL(req.url).searchParams.get("lang");
    if (requestedLocale && !isLocale(requestedLocale)) throw new HttpError(400, "Choose a supported language.");
    const locale = isLocale(requestedLocale) ? requestedLocale : "en";
    const text = (source: string, clinical = false) => {
      const result = translate(locale, source, clinical);
      return `<span lang="${result.lang}" dir="${localeInfo(result.lang).dir}">${esc(result.text)}</span>`;
    };
    const [recordsResult, responsesResult] = await db().batch([
      db()
        .prepare(
          "SELECT kind,status,at,data FROM records WHERE patient_id=? ORDER BY at DESC LIMIT 200",
        )
        .bind(pid),
      db()
        .prepare(
          "SELECT question_text,answer,version,at FROM responses WHERE patient_id=? ORDER BY at LIMIT 200",
        )
        .bind(pid),
    ]);
    const records = (recordsResult.results as any[]).map((r) => ({
      ...r,
      data: JSON.parse(r.data),
    }));
    const responses = responsesResult.results;
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
                        `<p><strong>${text(k)}:</strong> <bdi>${esc(typeof v === "object" ? JSON.stringify(v) : v)}</bdi></p>`,
                    )
                    .join("")}</article>`,
              )
              .join("")
          : "<p>No records recorded.</p>";
      const html = `<!doctype html><html lang="${locale}" dir="${localeInfo(locale).dir}"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Patient report ${esc(pid)}</title><link rel="stylesheet" href="/fonts/indic.css"><style>body{font:15px/1.6 "Noto Sans Telugu","Noto Sans Devanagari","Noto Sans Tamil","Noto Sans Kannada","Noto Sans Malayalam","Noto Sans Bengali","Noto Sans Gujarati","Noto Sans Gurmukhi","Noto Sans Oriya","Noto Sans Arabic","Noto Sans Ol Chiki",Arial,sans-serif;max-width:900px;margin:30px auto;padding:20px;color:#183e35}h1{font-size:25px}article{border-bottom:1px solid #ddd;padding:14px 0;break-inside:avoid}p{overflow-wrap:anywhere}button{padding:12px;margin:15px 0}@media print{button,.instructions{display:none}body{margin:0;padding:0}}</style><form class="instructions" method="get"><input type="hidden" name="patient" value="${esc(pid)}"><input type="hidden" name="mode" value="${a.demo ? 'demo' : 'live'}"><input type="hidden" name="format" value="html"><label>🌐 Language <select name="lang">${languages.map(l => '<option value="'+l.code+'"'+(l.code===locale?' selected':'')+'>'+l.name+'</option>').join('')}</select></label><button type="submit">${text('Apply language')}</button></form><h1>${text('Telangana Against Oral Cancer')} · ${text('Patient report')}</h1><p>Confidential · ${esc(new Date().toISOString())}${a.demo ? " · SYNTHETIC DEMONSTRATION" : ""}</p><p><strong>${esc(p.name)}</strong> · ${esc(pid)} · Age ${esc(p.age)}</p><p class="instructions">Use your browser’s Print command to print or save as PDF. Store only in an authorised location.</p><h2>${text("Clinical history")}</h2>${table(records.filter((r:any) => r.kind !== "referral"))}<h2>${text("Questionnaire history")}</h2>${table(responses)}<p>Screening findings are not a confirmed cancer diagnosis.</p></html>`;
      return new Response(html, {
        headers: {
          "Content-Type": "text/html; charset=utf-8",
          "Cache-Control": "no-store, private",
          "Content-Security-Policy":
            "default-src 'none'; style-src 'self' 'unsafe-inline'; font-src 'self'; form-action 'self'; frame-ancestors 'none'",
        },
      });
    }
    return response({
      generatedAt: new Date().toISOString(),
      displayLanguage: locale,
      patientLanguage: p.preferred_language || "en",
      patient: { id: p.id, name: p.name, age: p.age },
      records,
      responses,
    });
  } catch (e) {
    return failure(e);
  }
}
