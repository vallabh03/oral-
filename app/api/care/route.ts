import { actionPermissions } from "@/lib/permissions";
import { z } from "zod";
import {
  actor,
  db,
  runtime,
  id,
  now,
  hash,
  requireRole,
  requirePermission,
  patient,
  auditStatement,
  log,
  rate,
  response,
  failure,
  HttpError,
  originCheck,
  seed,
  boundedBody,
  sampleEvent,
} from "@/lib/server";
import {
  registration,
  protocolSchema,
  validateAnswers,
  nextSample,
  accountTypes,
  hasRole,
  treatmentAllowed,
  classify,
  pathwayFor,
  protocolSchema as protocolDef,
  impressions,
  findings,
  sites,
} from "@/lib/domain";
export const dynamic = "force-dynamic";
// Consent records carry the approved wording version. Demo records are
// labelled so they can never be mistaken for live consent.
function consentVersion(a: { demo: boolean }) {
  const v = runtime().CONSENT_VERSION?.trim();
  return a.demo
    ? "DEMO-" + (v || "DRIVE-SAFE-1.0-provisional")
    : v || "DRIVE-SAFE-1.0-provisional";
}
export async function GET(req: Request) {
  try {
    const a = await actor(req);
    await rate(a);
    const url = new URL(req.url),
      pid = url.searchParams.get("patient");
    if (pid) {
      const p = await patient(a, pid);
      await log(a, "Patient record viewed", pid);
      // Batch all 7 patient-scoped reads into a single D1 round-trip.
      // Previously these were sent via Promise.all which issues 7 independent
      // HTTP requests to D1. db().batch() sends them as one request, reducing
      // latency by ~6× under concurrent load.
      const [cs, rs, ss, rps, answers, events, sevents] = (await db().batch([
        db().prepare("SELECT * FROM consents WHERE patient_id=? ORDER BY at").bind(pid),
        db().prepare("SELECT * FROM records WHERE patient_id=? ORDER BY at DESC").bind(pid),
        db().prepare("SELECT * FROM samples WHERE patient_id=?").bind(pid),
        db().prepare("SELECT id,sample_id,patient_id,filename,status,at,verified_by FROM reports WHERE patient_id=?").bind(pid),
        // LIMIT 200: prevents unbounded reads on patients with many questionnaire answers.
        db().prepare("SELECT question_id,question_text,version,answer,at FROM responses WHERE patient_id=? ORDER BY at LIMIT 200").bind(pid),
        // LIMIT 200: audit timeline — most recent 200 events is sufficient for UI.
        db().prepare("SELECT action,at,actor FROM audit WHERE patient_id=? ORDER BY at DESC LIMIT 200").bind(pid),
        db().prepare("SELECT sample_id,status,at,actor FROM sample_events WHERE patient_id=? ORDER BY at").bind(pid),
      ])) as D1Result<any>[];
      // Clinical staff see everything; read-only assistants see structured
      // workflow data but never free-text clinical/counselling notes.
      const full = a.demo || hasRole(a.role, "ADMIN", "DOCTOR");
      const reporting = !full && a.role === "ASSISTANT";
      const records = rs.results
        .filter(
          (r) =>
            full ||
            reporting ||
            (a.role === "COUNSELLOR" &&
              ["counselling", "followup", "referral"].includes(r.kind)) ||
            (a.role === "PATIENT" && r.kind === "followup"),
        )
        .map((r) => {
          const d = JSON.parse(r.data);
          if (!full) delete d.clinicalOutcome;
          if (reporting) {
            delete d.notes;
            delete d.decision;
          }
          return { ...r, data: d };
        });
      const reports = rps.results.filter(
        (r) =>
          (a.demo ||
            hasRole(a.role, "ADMIN", "LAB") ||
            r.status === "Linked") &&
          (a.demo ||
            a.role !== "LAB" ||
            ss.results.some((s) => s.id === r.sample_id && s.lab_id === a.id)),
      );
      const labs = a.role === "LAB";
      // Patients see their pathway only as guidance from the care team, never
      // the internal group number or classification label.
      const hidden = ["qr_hash", "tenant"].concat(
        a.role === "PATIENT"
          ? ["category", "pathway", "doctor_id", "counsellor_id"]
          : [],
      );
      return response({
        patient: labs
          ? { id: p.id, name: p.name }
          : Object.fromEntries(
              Object.entries(p).filter(([k]) => !hidden.includes(k)),
            ),
        consents: labs ? [] : cs.results,
        records,
        samples: ss.results
          .filter((s) => a.demo || a.role !== "LAB" || s.lab_id === a.id)
          .map((s) => ({
            ...s,
            history: sevents.results
              .filter((e) => e.sample_id === s.id)
              .map(({ status, at }) => ({ status, at })),
          })),
        reports,
        answers:
          full || reporting || a.role === "COUNSELLOR" ? answers.results : [],
        timeline: full ? events.results : [],
      });
    }
    // ------------------------------------------------------------------
    // Build a tenant-scoped, role-filtered WHERE clause for patients.
    // ------------------------------------------------------------------
    const patientTerms: string[] = ["tenant=?"];
    const patientArgs: any[] = [a.tenant];
    if (!a.demo) {
      if (a.role === "DOCTOR") { patientTerms.push("doctor_id=?"); patientArgs.push(a.id); }
      if (a.role === "COUNSELLOR") { patientTerms.push("counsellor_id=?"); patientArgs.push(a.id); }
      if (a.role === "PATIENT") { patientTerms.push("id=?"); patientArgs.push(a.patientId || "none"); }
      if (a.role === "LAB") { patientTerms.push("id IN (SELECT patient_id FROM samples WHERE lab_id=?)"); patientArgs.push(a.id); }
    }
    const pClause = patientTerms.join(" AND ");

    // ------------------------------------------------------------------
    // Cursor-based pagination for patients list.
    // Accept: ?cursor=<ISO created_at>&limit=<1-100>
    // Returns: { patients, nextCursor } — nextCursor is null when no more.
    // ------------------------------------------------------------------
    const url2 = new URL(req.url);
    const cursor = url2.searchParams.get("cursor") || "9999-99-99T99:99:99.999Z";
    const rawLimit = Math.min(100, Math.max(1, parseInt(url2.searchParams.get("limit") || "50", 10)));
    // Fetch one extra row to detect whether there are more pages.
    const fetchLimit = rawLimit + 1;

    // ------------------------------------------------------------------
    // Batch all workspace reads into a single D1 round-trip.
    // ------------------------------------------------------------------
    const usersStmt =
      a.demo
        ? db().prepare("SELECT 1 WHERE 0") // no-op placeholder
        : ["SUPER_ADMIN", "ADMIN"].includes(a.role)
          ? db().prepare("SELECT id,name,email,role,active FROM users")
          : a.role === "DOCTOR_ADMIN"
            ? db().prepare(
                "SELECT id,name,role,active FROM users WHERE active=1 AND role IN ('DOCTOR_ADMIN','SUPER_ADMIN','LAB')",
              )
            : db().prepare("SELECT 1 WHERE 0"); // no-op for roles that don't need users

    const [patientsResult, campsResult, protocolsResult, recordsResult, samplesResult, usersResult] =
      await db().batch([
        db()
          .prepare(
            `SELECT id,name,phone,camp_id,created_at,category,pathway FROM patients WHERE ${pClause} AND created_at<=? ORDER BY created_at DESC LIMIT ?`,
          )
          .bind(...patientArgs, cursor, fetchLimit),
        db()
          .prepare("SELECT * FROM camps WHERE tenant=?")
          .bind(a.tenant),
        db()
          .prepare("SELECT * FROM protocols WHERE tenant=? ORDER BY rowid DESC")
          .bind(a.tenant),
        // Records join: use the same term list but prefix with p. to avoid ambiguity.
        db()
          .prepare(
            `SELECT r.id,r.patient_id,r.kind,r.status,r.at,r.data
             FROM records r
             JOIN patients p ON p.id=r.patient_id
             WHERE ${patientTerms.map((t) => t.replace(/^(\w)/, "p.$1")).join(" AND ")}
               AND r.kind IN ('referral','counselling','followup')`,
          )
          .bind(...patientArgs),
        db()
          .prepare(
            `SELECT s.* FROM samples s
             JOIN patients p ON p.id=s.patient_id
             WHERE ${patientTerms.map((t) => t.replace(/^(\w)/, "p.$1")).join(" AND ")}`,
          )
          .bind(...patientArgs),
        usersStmt,
      ]);

    const allPatients = patientsResult.results as any[];
    const hasMore = allPatients.length > rawLimit;
    const pagePatients = hasMore ? allPatients.slice(0, rawLimit) : allPatients;
    const nextCursor = hasMore ? pagePatients[pagePatients.length - 1].created_at : null;

    await log(a, "Workspace accessed");
    return response({
      actor: { name: a.name, role: a.role, demo: a.demo },
      patients: pagePatients.map((p: any) =>
        a.role === "LAB" && !a.demo
          ? { id: p.id, name: p.name, camp_id: p.camp_id, created_at: p.created_at }
          : p,
      ),
      nextCursor,
      camps: campsResult.results,
      protocols: (protocolsResult.results as any[])
        .filter(
          (p) =>
            a.demo ||
            hasRole(a.role, "ADMIN", "DOCTOR", "ASSISTANT") ||
            p.status === "Approved",
        )
        .map((p) => ({ ...p, definition: JSON.parse(p.definition) })),
      users: a.demo ? [] : usersResult.results,
      records: (recordsResult.results as any[]).map((r) => ({
        ...r,
        data:
          a.demo || hasRole(a.role, "ADMIN", "DOCTOR", "ASSISTANT")
            ? JSON.parse(r.data)
            : a.role === "COUNSELLOR"
              ? Object.fromEntries(
                  Object.entries(JSON.parse(r.data)).filter(
                    ([k]) => k !== "clinicalOutcome",
                  ),
                )
              : { date: JSON.parse(r.data).date },
      })),
      samples: samplesResult.results,
    });
  } catch (e) {
    return failure(e);
  }
}
export async function POST(req: Request) {
  try {
    originCheck(req);
    const a = await actor(req);
    await rate(a);
    const raw = new TextDecoder().decode(await boundedBody(req, 100000));
    const b = JSON.parse(raw);
    const at = now();
    if (actionPermissions[b.action])
      await requirePermission(a, actionPermissions[b.action]);
    if (["sample", "sampleStatus", "verifyReport", "linkReport"].includes(b.action))
      throw new HttpError(410, "Sample and laboratory workflows are retired. Historical records are retained.");
    if (b.action === "sessionStart" || b.action === "sessionEnd") {
      await log(
        a,
        b.action === "sessionStart"
          ? "Authenticated workspace session started"
          : "Workspace logout",
      );
      return response({ ok: true });
    }
    if (b.action === "seed") {
      await seed(a);
      return response({ ok: true });
    }
    if (b.action === "register") {
      if (!a.demo && runtime().LIVE_INTAKE_ENABLED !== "true")
        throw new HttpError(503, "Live participant intake is not open.");
      requireRole(a, "ADMIN", "REGISTRATION");
      const d = registration.parse(b.data);
      if (a.demo && !d.name.toLowerCase().startsWith("demo "))
        throw new HttpError(400, "Use a synthetic name starting with “Demo ”.");
      if (
        d.campId &&
        !(await db()
          .prepare("SELECT id FROM camps WHERE id=? AND tenant=?")
          .bind(d.campId, a.tenant)
          .first())
      )
        throw new HttpError(400, "Invalid camp.");
      const duplicate = await db()
        .prepare(
          "SELECT id FROM patients WHERE tenant=? AND name=? COLLATE NOCASE AND phone=?",
        )
        .bind(a.tenant, d.name, d.phone)
        .first();
      if (d.phone && duplicate)
        throw new HttpError(
          409,
          "A matching registration already exists. Search by name or phone before continuing.",
        );
      const pid = id("HAOC-DS");
      await db().batch([
        db()
          .prepare(
            "INSERT INTO patients (id,tenant,name,phone,age,camp_id,created_at,demo,driver_type,working_area,recruitment,contact_intended,preferred_language) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)",
          )
          .bind(
            pid,
            a.tenant,
            d.name,
            d.phone,
            d.age,
            d.campId,
            at,
            a.demo ? 1 : 0,
            d.driverType,
            d.workingArea,
            d.recruitment,
            d.contactIntended ? 1 : 0,
            d.preferredLanguage,
          ),
        ...["registration", "screening"].map((type) =>
          db()
            .prepare(
              "INSERT INTO consents (id,patient_id,type,status,version,at,actor,method) VALUES (?,?,?,?,?,?,?,?)",
            )
            .bind(
              id("CON"),
              pid,
              type,
              "granted",
              consentVersion(a),
              at,
              a.id,
              "Explicit checkbox",
            ),
        ),
        ...(d.whatsappReportConsent ? [db()
          .prepare("INSERT INTO consents (id,patient_id,type,status,version,at,actor,method) VALUES (?,?,?,?,?,?,?,?)")
          .bind(id("CON"), pid, "whatsapp_report", "granted", consentVersion(a), at, a.id, "Explicit checkbox")]: []),
        await auditStatement(
          a,
          "Registration and screening consent recorded",
          pid,
        ),
      ]);
      return response({ id: pid });
    }
    if (b.action === "camp") {
      await requirePermission(a, "settings.manage");
      const d = z
        .object({
          name: z.string().min(3).max(120),
          location: z.string().min(3).max(200),
          date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        })
        .parse(b.data);
      await db().batch([
        db()
          .prepare(
            "INSERT INTO camps (id,tenant,name,location,date) VALUES (?,?,?,?,?)",
          )
          .bind(id("CAMP"), a.tenant, d.name, d.location, d.date),
        await auditStatement(a, "Camp created"),
      ]);
      return response({ ok: true });
    }
    if (b.action === "protocol") {
      await requirePermission(a, "settings.manage");
      const p = protocolSchema.parse(b.data);
      await db().batch([
        db()
          .prepare(
            "INSERT INTO protocols (id,tenant,version,definition,status,created_by) VALUES (?,?,?,?,?,?)",
          )
          .bind(
            id("PROT"),
            a.tenant,
            p.version,
            JSON.stringify(p),
            "Draft",
            a.id,
          ),
        await auditStatement(a, "Questionnaire draft saved"),
      ]);
      return response({ ok: true });
    }
    if (b.action === "approveProtocol") {
      requireRole(a, "DOCTOR");
      if (b.confirm !== true)
        throw new HttpError(400, "Clinical approval is required.");
      const p = await db()
        .prepare("SELECT * FROM protocols WHERE id=? AND tenant=? AND status=?")
        .bind(b.id, a.tenant, "Draft")
        .first<any>();
      if (!p) throw new HttpError(404, "Draft unavailable.");
      protocolSchema.parse(JSON.parse(p.definition));
      await db().batch([
        db()
          .prepare(
            "UPDATE protocols SET status='Retired' WHERE tenant=? AND status='Approved'",
          )
          .bind(a.tenant),
        db()
          .prepare(
            "UPDATE protocols SET status='Approved',approved_by=?,approved_at=? WHERE id=?",
          )
          .bind(a.id, at, b.id),
        await auditStatement(a, "Screening protocol approved"),
      ]);
      return response({ ok: true });
    }
    if (b.action === "user") {
      requireRole(a, "SUPER_ADMIN");
      const d = z
        .object({
          id: z.string().min(3).max(150),
          name: z.string().min(2).max(120),
          email: z.string().email(),
          role: z.enum(accountTypes),
          patientId: z.string().nullable(),
          active: z.boolean(),
        })
        .parse(b.data);
      if (d.id === a.id && (!d.active || d.role !== "SUPER_ADMIN"))
        throw new HttpError(
          400,
          "You cannot remove your own administrator access.",
        );
      if (a.demo)
        throw new HttpError(
          400,
          "Live account management is unavailable in demonstration mode.",
        );
      // This action creates programme-level accounts (DOCTOR_ADMIN, SUPER_ADMIN, ASSISTANT).
      // The PATIENT role is a legacy read-only role linked at D1 level, not created via this form.
      // patient_id is therefore always null for accounts managed through this action.
      const linked: string | null = null;
      if (
        linked !== null &&
        !(await db()
          .prepare("SELECT id FROM patients WHERE id=? AND tenant='live'")
          .bind(linked)
          .first())
      )
        throw new HttpError(
          400,
          "Enter an existing participant ID for a patient account.",
        );
      await db().batch([
        db()
          .prepare(
            "INSERT INTO users (id,email,name,role,active,patient_id) VALUES (?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET email=excluded.email,name=excluded.name,role=excluded.role,active=excluded.active,patient_id=excluded.patient_id",
          )
          .bind(d.id, d.email, d.name, d.role, d.active ? 1 : 0, linked),
        db()
          .prepare("UPDATE app_sessions SET revoked=1 WHERE user_id=?")
          .bind(d.id),
        await auditStatement(
          a,
          "User permissions updated: " +
            d.id +
            " → " +
            d.role +
            (d.active ? " active" : " disabled"),
        ),
      ]);
      // Invalidate KV user cache so the role/active change takes effect immediately
      // on the next request — without this, the stale row would persist for up to 5m.
      const kv = runtime().RATE_KV;
      if (kv) await kv.delete(`user:${d.id}`);
      return response({ ok: true });
    }
    if (b.action === "lookup") {
      const token = z.string().max(200).parse(b.token);
      let p;
      if (token.startsWith("HAOC-DS-"))
        p = await db()
          .prepare("SELECT id FROM patients WHERE id=? AND tenant=?")
          .bind(token, a.tenant)
          .first<any>();
      else
        p = await db()
          .prepare("SELECT id FROM patients WHERE qr_hash=? AND tenant=?")
          .bind(await hash(token), a.tenant)
          .first<any>();
      if (!p) throw new HttpError(404, "No authorized matching patient.");
      await patient(a, p.id);
      await log(a, "QR or patient ID accessed", p.id);
      return response({ id: p.id });
    }
    const p = await patient(a, z.string().parse(b.patientId));
    const pid = p.id;
    const consent = async (type: string) => {
      const r = await db()
        .prepare(
          "SELECT status FROM consents WHERE patient_id=? AND type=? ORDER BY rowid DESC LIMIT 1",
        )
        .bind(pid, type)
        .first<any>();
      return r?.status === "granted";
    };
    if (b.action === "qr") {
      requireRole(a, "ADMIN", "REGISTRATION", "DOCTOR", "PATIENT");
      const token = crypto.randomUUID() + crypto.randomUUID();
      await db().batch([
        db()
          .prepare("UPDATE patients SET qr_hash=? WHERE id=?")
          .bind(await hash(token), pid),
        await auditStatement(a, "Patient QR rotated", pid),
      ]);
      return response({ token });
    }
    if (b.action === "screen") {
      requireRole(a, "ADMIN", "REGISTRATION", "DOCTOR");
      if (!(await consent("screening")))
        throw new HttpError(400, "Screening consent is required.");
      const prot = await db()
        .prepare("SELECT * FROM protocols WHERE id=? AND tenant=?")
        .bind(b.protocolId, a.tenant)
        .first<any>();
      if (!prot || (!a.demo && prot.status !== "Approved"))
        throw new HttpError(409, "No approved questionnaire is available.");
      const definition = protocolSchema.parse(JSON.parse(prot.definition));
      let answers;
      try {
        answers = validateAnswers(definition, b.answers);
      } catch (e) {
        throw new HttpError(422, (e as Error).message);
      }
      const inserts = definition.questions
        .filter((q) => Object.hasOwn(answers, q.id))
        .map((q) =>
          db()
            .prepare(
              "INSERT INTO responses (id,patient_id,protocol_id,question_id,question_text,version,answer,at,actor) VALUES (?,?,?,?,?,?,?,?,?)",
            )
            .bind(
              id("ANS"),
              pid,
              prot.id,
              q.id,
              q.text,
              prot.version,
              JSON.stringify(answers[q.id]),
              at,
              a.id,
            ),
        );
      inserts.push(
        db()
          .prepare(
            "INSERT INTO records (id,patient_id,kind,data,status,at,actor) VALUES (?,?,?,?,?,?,?)",
          )
          .bind(
            id("REC"),
            pid,
            "screening",
            JSON.stringify({
              protocolId: prot.id,
              version: prot.version,
              answers,
            }),
            "Awaiting oral examination",
            at,
            a.id,
          ),
      );
      inserts.push(
        db()
          .prepare(
            "UPDATE patients SET category=NULL,pathway='Awaiting oral examination' WHERE id=?",
          )
          .bind(pid),
      );
      await db().batch([
        ...inserts,
        await auditStatement(
          a,
          "Participant questionnaire recorded; awaiting clinician examination",
          pid,
        ),
      ]);
      return response({ pathway: "Awaiting oral examination" });
    }
    if (b.action === "examination") {
      requireRole(a, "DOCTOR");
      const d = z
        .object({
          completed: z.boolean(),
          habit: z.boolean().nullable(),
          lesion: z.boolean().nullable(),
          verified: z.literal(true),
          mouthOpening: z.enum(["Normal", "Restricted"]).nullable(),
          distance: z.number().min(0).max(100).nullable(),
          findings: z.array(z.string()),
          site: z.array(z.string()),
          impression: z.string(),
          notes: z.string().max(8000),
          recommendedTests: z.string().max(2000).default(""),
          referral: z.enum(["No", "Planned-routine", "Priority"]).optional().default("No"),
          destination: z.enum([
            "Not applicable",
            "Government hospital",
            "HAOC-associated specialist pathway",
            "Participant’s preferred hospital or doctor",
            "Other",
          ]).optional().default("Not applicable"),
          followupRequired: z.boolean(),
          followupDate: z.string().nullable(),
        })
        .parse(b.data);
      if (
        d.completed &&
        (d.habit === null ||
          d.lesion === null ||
          d.mouthOpening === null ||
          !d.findings.length ||
          !d.site.length)
      )
        throw new HttpError(
          400,
          "Explicitly complete habit, lesion, mouth opening, findings and site fields.",
        );
      if (
        d.findings.some((f) => !findings.includes(f)) ||
        d.site.some((f) => !sites.includes(f)) ||
        (d.completed && !impressions.includes(d.impression))
      )
        throw new HttpError(400, "Invalid examination options.");
      if (d.findings.includes("No abnormality") && d.findings.length > 1)
        throw new HttpError(
          400,
          "No abnormality cannot accompany an abnormal finding.",
        );
      if (
        d.completed &&
        d.lesion &&
        (d.impression === "Normal" || d.findings.includes("No abnormality"))
      )
        throw new HttpError(
          400,
          "Review the lesion flag and examination findings for consistency.",
        );
      if (d.completed && !d.lesion && d.impression !== "Normal")
        throw new HttpError(
          400,
          "Review lesion status before verifying this examination.",
        );
      if (
        d.completed &&
        d.mouthOpening === "Restricted" &&
        d.distance !== null &&
        (d.distance <= 0 || d.distance > 80)
      )
        throw new HttpError(
          400,
          "Enter a valid mouth opening distance between 1 and 80 mm.",
        );
      if (d.referral !== "No" && d.destination === "Not applicable")
        throw new HttpError(
          400,
          "Choose a referral destination when recommending a clinical referral.",
        );
      if (d.followupDate && !/^\d{4}-\d{2}-\d{2}$/.test(d.followupDate))
        throw new HttpError(400, "Choose a valid follow-up date.");
      if (!(await consent("screening")))
        throw new HttpError(
          409,
          "Screening consent must be recorded before the oral examination.",
        );
      if (!d.completed) {
        await db().batch([
          db()
            .prepare(
              "INSERT INTO records (id,patient_id,kind,data,status,at,actor) VALUES (?,?,?,?,?,?,?)",
            )
            .bind(
              id("REC"),
              pid,
              "assessment",
              JSON.stringify(d),
              "Unable or refused",
              at,
              a.id,
            ),
          await auditStatement(a, "Oral examination unable or refused", pid),
        ]);
        return response({ ok: true });
      }
      // Use the classification matrix of the newest approved protocol (any
      // protocol in the isolated demo workspace); fall back to DRIVE SAFE v1.0.
      const active = await db()
        .prepare(
          a.demo
            ? "SELECT definition FROM protocols WHERE tenant=? ORDER BY rowid DESC LIMIT 1"
            : "SELECT definition FROM protocols WHERE tenant=? AND status='Approved' ORDER BY rowid DESC LIMIT 1",
        )
        .bind(a.tenant)
        .first<any>();
      const matrix = active
        ? protocolSchema.parse(JSON.parse(active.definition)).classification
        : undefined;
      const group = classify(
        d.habit === true,
        d.lesion === true,
        d.completed,
        d.verified,
        matrix,
      );
      const pathway = pathwayFor(group, matrix);
      const ins = [
        db()
          .prepare(
            "INSERT INTO records (id,patient_id,kind,data,status,at,actor) VALUES (?,?,?,?,?,?,?)",
          )
          .bind(
            id("REC"),
            pid,
            "assessment",
            JSON.stringify({ ...d, group, framework: "DRIVE SAFE v1.0" }),
            "Clinician verified",
            at,
            a.id,
          ),
        db()
          .prepare("UPDATE patients SET category=?,pathway=? WHERE id=?")
          .bind(group, pathway, pid),
      ];
      if (d.habit)
        ins.push(
          db()
            .prepare(
              "INSERT INTO records (id,patient_id,kind,data,status,at,actor) VALUES (?,?,?,?,?,?,?)",
            )
            .bind(
              id("REC"),
              pid,
              "counselling",
              JSON.stringify({
                notes: "Cessation intervention required",
                interest: "See participant questionnaire",
              }),
              "Pending",
              at,
              a.id,
            ),
        );
      if (d.followupRequired)
        ins.push(
          db()
            .prepare(
              "INSERT INTO records (id,patient_id,kind,data,status,at,actor) VALUES (?,?,?,?,?,?,?)",
            )
            .bind(
              id("REC"),
              pid,
              "followup",
              JSON.stringify({
                date: d.followupDate,
                notes: d.followupDate
                  ? "Clinician-selected follow-up"
                  : "Interval to be selected by clinician",
              }),
              d.followupDate ? "Scheduled" : "Pending",
              at,
              a.id,
            ),
        );
      await db().batch([
        ...ins,
        await auditStatement(
          a,
          "Oral examination verified; Group " + group + " assigned",
          pid,
        ),
      ]);
      return response({ group, pathway });
    }
    if (b.action === "consent") {
      requireRole(a, "ADMIN", "REGISTRATION", "DOCTOR");
      const d = z
        .object({
          type: z.enum(["registration", "screening", "testing", "treatment", "whatsapp_report"]),
          status: z.enum(["granted", "withdrawn"]),
          method: z.enum(["Written", "Verbal witnessed", "Patient checkbox"]),
          confirmed: z.literal(true),
        })
        .parse(b.data);
      await db().batch([
        db()
          .prepare(
            "INSERT INTO consents (id,patient_id,type,status,version,at,actor,method) VALUES (?,?,?,?,?,?,?,?)",
          )
          .bind(
            id("CON"),
            pid,
            d.type,
            d.status,
            consentVersion(a),
            at,
            a.id,
            d.method,
          ),
        await auditStatement(a, d.type + " consent " + d.status, pid),
      ]);
      return response({ ok: true });
    }
    if (b.action === "assign") {
      await requirePermission(a, "settings.manage");
      const d = z
        .object({
          role: z.enum(["DOCTOR_ADMIN", "DOCTOR", "COUNSELLOR"]),
          userId: z.string(),
        })
        .parse(b.data);
      if (
        !(await db()
          .prepare("SELECT id FROM users WHERE id=? AND role=? AND active=1")
          .bind(d.userId, d.role)
          .first())
      )
        throw new HttpError(
          400,
          "Select an active staff member with the matching role.",
        );
      await db().batch([
        db()
          .prepare(
            `UPDATE patients SET ${["DOCTOR", "DOCTOR_ADMIN"].includes(d.role) ? "doctor_id" : "counsellor_id"}=? WHERE id=?`,
          )
          .bind(d.userId, pid),
        await auditStatement(a, d.role + " assigned", pid),
      ]);
      return response({ ok: true });
    }
    if (b.action === "record") {
      const d = z
        .object({
          kind: z.enum([
            "counselling",
            "referral",
            "assessment",
            "treatment",
            "followup",
          ]),
          notes: z.string().trim().min(3).max(8000),
          status: z.string().max(60),
          date: z.string().max(30).optional(),
          priority: z.enum(["Routine", "Priority", "Urgent"]).optional(),
          findings: z.string().max(8000).optional(),
          tests: z.string().max(2000).optional(),
          contactStatus: z
            .enum(["Contacted", "No answer", "Wrong/unavailable number"])
            .optional(),
          referralOutcome: z
            .enum([
              "Appointment planned",
              "Attended",
              "Did not attend",
              "Declined",
              "Unable to contact",
              "Pending",
            ])
            .optional(),
          clinicalOutcome: z
            .enum([
              "No significant lesion",
              "Benign lesion",
              "Potentially malignant disorder",
              "Biopsy advised/performed",
              "Malignancy confirmed",
              "Other",
              "Unknown",
            ])
            .optional(),
          cessationOutcome: z
            .enum([
              "Interested/referred",
              "Not interested",
              "Not applicable",
              "Unknown",
            ])
            .optional(),
          supportOffered: z.boolean().optional(),
        })
        .parse(b.data);
      if (d.kind === "referral")
        throw new HttpError(410, "The doctor referral workflow is retired.");
      const statuses: Record<string, string[]> = {
        counselling: [
          "Pending",
          "Assigned",
          "In progress",
          "Completed",
          "Follow-up required",
        ],
        referral: [
          "Pending",
          "Assigned",
          "Seen",
          "Further evaluation",
          "Treatment discussion",
          "Follow-up",
        ],
        assessment: ["Recorded"],
        treatment: ["Discussed", "Approved", "In progress", "Completed"],
        followup: ["Pending", "Scheduled", "Completed", "Missed"],
      };
      if (!statuses[d.kind].includes(d.status))
        throw new HttpError(400, "Invalid workflow status.");
      requireRole(
        a,
        ...{
          counselling: ["COUNSELLOR"],
          referral: ["ADMIN", "DOCTOR", "REGISTRATION"],
          assessment: ["DOCTOR"],
          treatment: ["DOCTOR"],
          followup: ["ADMIN", "DOCTOR", "COUNSELLOR"],
        }[d.kind],
      );
      if (d.clinicalOutcome) requireRole(a, "DOCTOR");
      if (d.kind === "followup" && !/^\d{4}-\d{2}-\d{2}$/.test(d.date || ""))
        throw new HttpError(400, "Choose a follow-up date.");
      if (d.kind === "treatment" && d.status !== "Discussed") {
        const assessed = !!(await db()
          .prepare(
            "SELECT id FROM records WHERE patient_id=? AND kind='assessment' AND status='Clinician verified' LIMIT 1",
          )
          .bind(pid)
          .first());
        if (
          !treatmentAllowed(
            a.demo ? "DOCTOR" : a.role,
            assessed,
            await consent("treatment"),
            d.notes,
          )
        )
          throw new HttpError(
            409,
            "A doctor assessment, clinical decision and separate treatment consent are required.",
          );
      }
      const writes = [];
      if (b.recordId) {
        const old = await db()
          .prepare(
            "SELECT * FROM records WHERE id=? AND patient_id=? AND kind=?",
          )
          .bind(b.recordId, pid, d.kind)
          .first<any>();
        if (!old) throw new HttpError(404, "Workflow record unavailable.");
        if (old.kind === "assessment" && old.status === "Clinician verified")
          throw new HttpError(
            409,
            "A verified examination cannot be edited. Record a new examination to amend it.",
          );
        writes.push(
          db()
            .prepare(
              "INSERT INTO records (id,patient_id,kind,data,status,at,actor) VALUES (?,?,?,?,?,?,?)",
            )
            .bind(
              id("HIST"),
              pid,
              "history:" + old.kind,
              old.data,
              old.status,
              old.at,
              old.actor,
            ),
        );
        writes.push(
          db()
            .prepare(
              "UPDATE records SET data=?,status=?,at=?,actor=? WHERE id=?",
            )
            .bind(JSON.stringify(d), d.status, at, a.id, old.id),
        );
      } else
        writes.push(
          db()
            .prepare(
              "INSERT INTO records (id,patient_id,kind,data,status,at,actor) VALUES (?,?,?,?,?,?,?)",
            )
            .bind(
              id("REC"),
              pid,
              d.kind,
              JSON.stringify(d),
              d.status,
              at,
              a.id,
            ),
        );
      await db().batch([
        ...writes,
        await auditStatement(a, d.kind + " " + d.status, pid),
      ]);
      return response({ ok: true });
    }
    if (b.action === "sample") {
      requireRole(a, "ADMIN", "DOCTOR", "LAB");
      if (!(await consent("testing")))
        throw new HttpError(409, "Separate testing consent is required.");
      if (
        !(await db()
          .prepare(
            "SELECT id FROM records WHERE patient_id=? AND kind='assessment' AND status='Clinician verified' AND length(json_extract(data,'$.recommendedTests'))>0 LIMIT 1",
          )
          .bind(pid)
          .first())
      )
        throw new HttpError(
          409,
          "A verified doctor assessment recommending testing is required before sample collection.",
        );
      const d = z
        .object({
          type: z.enum(["Oral sample", "Blood sample", "Other"]),
          location: z.string().min(2).max(200),
          labId: z.string().nullable(),
        })
        .parse(b.data);
      if (
        d.labId &&
        !(await db()
          .prepare(
            "SELECT id FROM users WHERE id=? AND role IN ('LAB','DOCTOR_ADMIN','SUPER_ADMIN') AND active=1",
          )
          .bind(d.labId)
          .first())
      )
        throw new HttpError(400, "Invalid lab assignment.");
      const sid = id("SAMP-ORL");
      await db().batch([
        db()
          .prepare(
            "INSERT INTO samples (id,patient_id,type,status,collected_at,collected_by,location,lab_id,revision) VALUES (?,?,?,?,?,?,?,?,0)",
          )
          .bind(sid, pid, d.type, "Collected", at, a.id, d.location, d.labId),
        sampleEvent(a, sid, pid, "Collected"),
        await auditStatement(a, "Sample collected: " + sid, pid),
      ]);
      return response({ id: sid });
    }
    if (b.action === "sampleStatus") {
      requireRole(a, "ADMIN", "LAB");
      const s = await db()
        .prepare("SELECT * FROM samples WHERE id=? AND patient_id=?")
        .bind(b.sampleId, pid)
        .first<any>();
      if (!s || (!a.demo && a.role === "LAB" && s.lab_id !== a.id))
        throw new HttpError(404, "Sample unavailable.");
      if (
        !nextSample(s.status, b.status) ||
        ["Report generated", "Report verified", "Report linked"].includes(
          b.status,
        )
      )
        throw new HttpError(
          409,
          "Use the next lifecycle step. Reports require the upload and verification workflow.",
        );
      const revision = z.number().int().parse(b.revision);
      if (s.revision !== revision)
        throw new HttpError(409, "Sample changed. Reload before continuing.");
      await db().batch([
        db()
          .prepare(
            "UPDATE samples SET status=?,revision=revision+1 WHERE id=? AND revision=?",
          )
          .bind(b.status, s.id, revision),
        sampleEvent(a, s.id, pid, b.status),
        await auditStatement(a, "Sample " + s.id + ": " + b.status, pid),
      ]);
      return response({ ok: true });
    }
    if (b.action === "verifyReport" || b.action === "linkReport") {
      requireRole(a, "ADMIN", "LAB");
      const r = await db()
        .prepare(
          "SELECT r.*,s.type,s.lab_id FROM reports r JOIN samples s ON s.id=r.sample_id AND s.patient_id=r.patient_id WHERE r.id=? AND r.patient_id=?",
        )
        .bind(b.reportId, pid)
        .first<any>();
      if (!r || (!a.demo && a.role === "LAB" && r.lab_id !== a.id))
        throw new HttpError(404, "Report unavailable.");
      if (
        b.confirm !== true ||
        b.sampleId !== r.sample_id ||
        b.patientName !== p.name ||
        b.sampleType !== r.type
      )
        throw new HttpError(
          400,
          "Confirm patient name, patient ID, sample ID and sample type.",
        );
      if (b.action === "verifyReport") {
        if (r.status !== "Uploaded")
          throw new HttpError(409, "Only uploaded reports may be verified.");
        if (!a.demo && r.uploaded_by === a.id)
          throw new HttpError(
            409,
            "A second authorized staff member must verify the report.",
          );
        await db().batch([
          db()
            .prepare(
              "UPDATE reports SET status='Verified',verified_by=? WHERE id=? AND status='Uploaded'",
            )
            .bind(a.id, r.id),
          db()
            .prepare(
              "UPDATE samples SET status='Report verified',revision=revision+1 WHERE id=?",
            )
            .bind(r.sample_id),
          sampleEvent(a, r.sample_id, pid, "Report verified"),
          await auditStatement(a, "Report verified: " + r.id, pid),
        ]);
      } else {
        if (r.status !== "Verified")
          throw new HttpError(
            409,
            "The report must be verified before linking.",
          );
        await db().batch([
          db()
            .prepare(
              "UPDATE reports SET status='Linked',linked_by=? WHERE id=? AND status='Verified'",
            )
            .bind(a.id, r.id),
          db()
            .prepare(
              "UPDATE samples SET status='Report linked',revision=revision+1 WHERE id=?",
            )
            .bind(r.sample_id),
          sampleEvent(a, r.sample_id, pid, "Report linked"),
          await auditStatement(a, "Report linked: " + r.id, pid),
        ]);
      }
      return response({ ok: true });
    }
    throw new HttpError(400, "Unknown action.");
  } catch (e) {
    return failure(e);
  }
}
