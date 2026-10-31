import { z } from "zod";
import {
  db,
  runtime,
  id,
  now,
  hash,
  auditStatement,
  response,
  failure,
  HttpError,
  originCheck,
  boundedBody,
  rateKey,
} from "@/lib/server";
import { registration, protocolSchema, validateAnswers } from "@/lib/domain";
export const dynamic = "force-dynamic";
function enabled() {
  const e = runtime();
  return (
    e.PUBLIC_INTAKE_ENABLED === "true" &&
    e.LIVE_INTAKE_ENABLED === "true" &&
    !!e.AUDIT_KEY &&
    !!e.PRIVACY_NOTICE &&
    !!e.CONSENT_VERSION
  );
}
export async function GET(req: Request) {
  try {
    if (!enabled()) return response({ enabled: false });

    const ip = req.headers.get("cf-connecting-ip") || "unavailable";
    const minute = Math.floor(Date.now() / 60000);
    const key = "intake-get:" + (await hash(ip + (runtime().AUDIT_KEY || "default"))) + ":" + minute;
    await rateKey(key, 60, 60, "Too many requests. Please wait a moment.");

    const p = await db()
      .prepare(
        "SELECT id,definition FROM protocols WHERE tenant='live' AND status='Approved' ORDER BY rowid DESC LIMIT 1",
      )
      .first<any>();
    if (!p) return response({ enabled: false });
    const camps = await db()
      .prepare("SELECT id,name,location,date FROM camps WHERE tenant='live'")
      .all();
    const res = response({
      enabled: true,
      camps: camps.results,
      protocolId: p.id,
      protocol: JSON.parse(p.definition),
      privacyNotice: runtime().PRIVACY_NOTICE,
      consentVersion: runtime().CONSENT_VERSION,
    });
    // Cache at edge for 2 minutes to handle heavy registration rushes without database hammering
    res.headers.set("Cache-Control", "public, s-maxage=120, stale-while-revalidate=60");
    return res;
  } catch (e) {
    return failure(e);
  }
}
export async function POST(req: Request) {
  try {
    originCheck(req);
    if (!enabled())
      throw new HttpError(
        503,
        "Participant intake is not open yet. Please speak with the camp coordinator.",
      );
    const raw = new TextDecoder().decode(await boundedBody(req, 50000));
    const b = JSON.parse(raw);
    const ip = req.headers.get("cf-connecting-ip") || "unavailable";
    const minute = Math.floor(Date.now() / 60000);
    const key = "intake:" + (await hash(ip + (runtime().AUDIT_KEY || "default"))) + ":" + minute;
    await rateKey(key, 20, 60, "Please wait a minute and try again.");
    const a = {
      id: "participant-entry",
      name: "Participant",
      role: "PUBLIC",
      tenant: "live",
      demo: false,
    };
    if (b.action === "register") {
      const d = registration.parse(b.data);
      const p = await db()
        .prepare(
          "SELECT id FROM protocols WHERE tenant='live' AND status='Approved' ORDER BY rowid DESC LIMIT 1",
        )
        .first<any>();
      if (!p) throw new HttpError(503, "Screening is not currently available.");
      if (
        !(await db()
          .prepare("SELECT id FROM camps WHERE id=? AND tenant='live'")
          .bind(d.campId)
          .first())
      )
        throw new HttpError(400, "Please select a screening event.");
      if (
        d.phone &&
        (await db()
          .prepare(
            "SELECT id FROM patients WHERE tenant='live' AND lower(name)=lower(?) AND phone=?",
          )
          .bind(d.name, d.phone)
          .first())
      )
        throw new HttpError(
          409,
          "Please ask the registration desk to help complete this registration.",
        );
      const pid = id("HAOC-DS"),
        token = crypto.randomUUID() + crypto.randomUUID(),
        at = now();
      await db().batch([
        db()
          .prepare(
            "INSERT INTO patients (id,tenant,name,phone,age,camp_id,created_at,demo,driver_type,working_area,recruitment,contact_intended,preferred_language) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)",
          )
          .bind(
            pid,
            "live",
            d.name,
            d.phone,
            d.age,
            d.campId,
            at,
            0,
            d.driverType,
            d.workingArea,
            d.recruitment,
            d.contactIntended ? 1 : 0,
            d.preferredLanguage,
          ),
        ...["registration", "screening"].map((t) =>
          db()
            .prepare(
              "INSERT INTO consents (id,patient_id,type,status,version,at,actor,method) VALUES (?,?,?,?,?,?,?,?)",
            )
            .bind(
              id("CON"),
              pid,
              t,
              "granted",
              runtime().CONSENT_VERSION,
              at,
              "participant-entry",
              "Explicit checkbox",
            ),
        ),
        ...(d.whatsappReportConsent ? [db()
          .prepare("INSERT INTO consents (id,patient_id,type,status,version,at,actor,method) VALUES (?,?,?,?,?,?,?,?)")
          .bind(id("CON"), pid, "whatsapp_report", "granted", runtime().CONSENT_VERSION, at, "participant-entry", "Explicit checkbox")]: []),
        db()
          .prepare(
            "INSERT INTO intake_tokens (hash,patient_id,protocol_id,expires,used) VALUES (?,?,?,?,0)",
          )
          .bind(await hash(token), pid, p.id, Date.now() + 30 * 60 * 1000),
        await auditStatement(
          a,
          "Participant consent and registration recorded",
          pid,
        ),
      ]);
      return response({ id: pid, token, protocolId: p.id });
    }
    if (b.action === "screen") {
      const tokenHash = await hash(z.string().min(64).max(100).parse(b.token));
      const t = await db()
        .prepare("SELECT * FROM intake_tokens WHERE hash=? AND expires>?")
        .bind(tokenHash, Date.now())
        .first<any>();
      if (!t)
        throw new HttpError(
          403,
          "This registration session has expired. Ask the registration desk for assistance.",
        );
      if (t.used) return response({ ok: true });
      const p = await db()
        .prepare("SELECT * FROM protocols WHERE id=? AND status='Approved'")
        .bind(t.protocol_id)
        .first<any>();
      if (!p)
        throw new HttpError(
          409,
          "The questionnaire changed. Please ask the camp coordinator for assistance.",
        );
      let answers;
      const definition = protocolSchema.parse(JSON.parse(p.definition));
      try {
        answers = validateAnswers(definition, b.answers);
      } catch (e) {
        throw new HttpError(422, (e as Error).message);
      }
      const at = now();
      await db().batch([
        ...definition.questions
          .filter((q) => Object.hasOwn(answers, q.id))
          .map((q) =>
            db()
              .prepare(
                "INSERT INTO responses (id,patient_id,protocol_id,question_id,question_text,version,answer,at,actor) VALUES (?,?,?,?,?,?,?,?,?)",
              )
              .bind(
                tokenHash + "-" + q.id,
                t.patient_id,
                p.id,
                q.id,
                q.text,
                p.version,
                JSON.stringify(answers[q.id]),
                at,
                "participant-entry",
              ),
          ),
        db()
          .prepare(
            "INSERT INTO records (id,patient_id,kind,data,status,at,actor) VALUES (?,?,?,?,?,?,?)",
          )
          .bind(
            "SCREEN-" + tokenHash,
            t.patient_id,
            "screening",
            JSON.stringify({ protocolId: p.id, version: p.version, answers }),
            "Awaiting oral examination",
            at,
            "participant-entry",
          ),
        db()
          .prepare(
            "UPDATE patients SET pathway='Awaiting oral examination' WHERE id=?",
          )
          .bind(t.patient_id),
        db()
          .prepare("UPDATE intake_tokens SET used=1 WHERE hash=?")
          .bind(tokenHash),
        await auditStatement(
          a,
          "Participant questionnaire recorded",
          t.patient_id,
        ),
      ]);
      return response({ ok: true });
    }
    throw new HttpError(400, "Unsupported request.");
  } catch (e) {
    return failure(e, req, "participant-entry");
  }
}
