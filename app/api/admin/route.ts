import { z } from "zod";
import {
  actor,
  db,
  runtime,
  requirePermission,
  securityPolicy,
  invalidatePolicyCache,
  originCheck,
  rate,
  log,
  auditStatement,
  response,
  failure,
  boundedBody,
  HttpError,
  now,
} from "@/lib/server";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const a = await actor(req);
    await requirePermission(a, "settings.manage");
    await rate(a);

    if (a.demo)
      return response({
        policy: { idleMinutes: 15, absoluteHours: 8 },
        sessions: [],
        errors: [],
        status: {
          database: "Demonstration",
          reportStorage: "Demonstration",
          authentication: "Managed identity provider",
          liveIntake: false,
          publicIntake: false,
          auditSigning: false,
        },
        settings: '{"supportEmail":"","supportPhone":""}',
      });

    const health = await db().prepare("SELECT 1 AS ok").first();

    const policy = await securityPolicy();

    // Fetch active sessions and recent errors in parallel — both read-only.
    const [sessions, errors, settingsRow] = await db().batch([
      db()
        .prepare(
          "SELECT user_id,created_at,last_seen,expires_at FROM app_sessions WHERE revoked=0 AND expires_at>? AND last_seen>? ORDER BY last_seen DESC LIMIT 100",
        )
        .bind(Date.now(), Date.now() - policy.idleMinutes * 60000),
      db()
        .prepare(
          "SELECT at,code,message,path FROM app_errors ORDER BY at DESC LIMIT 30",
        ),
      db()
        .prepare("SELECT value FROM app_settings WHERE id='programme'"),
    ]);

    // Backup export — separate permission, no row limit enforced per table but
    // uses db().batch() for parallel reads rather than sequential awaits.
    if (new URL(req.url).searchParams.get("export") === "backup") {
      await requirePermission(a, "backup.export");
      if (a.demo)
        throw new HttpError(
          400,
          "Backup export is available only in the live system workspace.",
        );

      // Parallel reads for all tables in the tenant scope.
      const [
        patientsRows,
        campsRows,
        protocolsRows,
        auditRows,
        consentsRows,
        responsesRows,
        recordsRows,
        samplesRows,
        reportsRows,
        sampleEventsRows,
        // Users are global; return only non-sensitive fields.
        usersRows,
      ] = await db().batch([
        db()
          .prepare("SELECT * FROM patients WHERE tenant=?")
          .bind(a.tenant),
        db()
          .prepare("SELECT * FROM camps WHERE tenant=?")
          .bind(a.tenant),
        db()
          .prepare("SELECT * FROM protocols WHERE tenant=?")
          .bind(a.tenant),
        db()
          .prepare("SELECT * FROM audit WHERE tenant=?")
          .bind(a.tenant),
        db().prepare(
          "SELECT t.* FROM consents t JOIN patients p ON p.id=t.patient_id WHERE p.tenant=?",
        ).bind(a.tenant),
        db().prepare(
          "SELECT t.* FROM responses t JOIN patients p ON p.id=t.patient_id WHERE p.tenant=?",
        ).bind(a.tenant),
        db().prepare(
          "SELECT t.* FROM records t JOIN patients p ON p.id=t.patient_id WHERE p.tenant=?",
        ).bind(a.tenant),
        db().prepare(
          "SELECT t.* FROM samples t JOIN patients p ON p.id=t.patient_id WHERE p.tenant=?",
        ).bind(a.tenant),
        db().prepare(
          "SELECT t.* FROM reports t JOIN patients p ON p.id=t.patient_id WHERE p.tenant=?",
        ).bind(a.tenant),
        db().prepare(
          "SELECT t.* FROM sample_events t JOIN patients p ON p.id=t.patient_id WHERE p.tenant=?",
        ).bind(a.tenant),
        // Return only identity fields — no session tokens or auth secrets.
        db().prepare(
          "SELECT id,email,name,role,active,patient_id FROM users",
        ),
      ]);

      await log(a, "Authorised system backup metadata exported");
      return response({
        version: 1,
        generatedAt: now(),
        tables: {
          patients: patientsRows.results,
          camps: campsRows.results,
          protocols: protocolsRows.results,
          audit: auditRows.results,
          consents: consentsRows.results,
          responses: responsesRows.results,
          records: recordsRows.results,
          samples: samplesRows.results,
          reports: reportsRows.results,
          sample_events: sampleEventsRows.results,
          users: usersRows.results,
        },
        notice:
          "Contains identifiable health information. Store only in an authorised encrypted location. Private PDF objects and authentication/session secrets are not included; this is a logical data export, not a complete disaster-recovery backup.",
      });
    }

    await log(a, "System status viewed");
    return response({
      errors: errors.results,
      policy,
      sessions: sessions.results,
      status: {
        database: health ? "Connected" : "Unavailable",
        reportStorage: runtime().BUCKET ? "Bound" : "Missing",
        auditSigning: !!runtime().AUDIT_KEY,
        liveIntake: runtime().LIVE_INTAKE_ENABLED === "true",
        publicIntake: runtime().PUBLIC_INTAKE_ENABLED === "true",
        authentication: "Managed identity provider",
        checkedAt: now(),
      },
      settings:
        (settingsRow.results[0] as { value: string } | undefined)?.value ||
        '{"supportEmail":"","supportPhone":""}',
    });
  } catch (e) {
    return failure(e);
  }
}

export async function POST(req: Request) {
  try {
    originCheck(req);
    const a = await actor(req);
    await requirePermission(a, "settings.manage");
    await rate(a);

    if (a.demo)
      throw new HttpError(
        400,
        "System changes are disabled in demonstration mode.",
      );

    const b = JSON.parse(
      new TextDecoder().decode(await boundedBody(req, 10000)),
    );

    if (b.action === "revokeSessions") {
      const userId = z.string().min(1).max(150).parse(b.userId);
      await db().batch([
        db()
          .prepare("UPDATE app_sessions SET revoked=1 WHERE user_id=?")
          .bind(userId),
        await auditStatement(a, "Sessions revoked: " + userId),
      ]);
      return response({ ok: true });
    }

    const key =
      b.action === "security"
        ? "security"
        : b.action === "programme"
          ? "programme"
          : null;
    if (!key) throw new HttpError(400, "Unknown setting.");

    const data =
      key === "security"
        ? z
            .object({
              idleMinutes: z.number().int().min(5).max(60),
              absoluteHours: z.number().int().min(1).max(12),
            })
            .strict()
            .parse(b.data)
        : z
            .object({
              supportEmail: z.union([z.string().email(), z.literal("")]),
              supportPhone: z.string().max(30),
            })
            .strict()
            .parse(b.data);

    await db().batch([
      db()
        .prepare(
          "INSERT INTO app_settings(id,value,updated_at,updated_by) VALUES (?,?,?,?) ON CONFLICT(id) DO UPDATE SET value=excluded.value,updated_at=excluded.updated_at,updated_by=excluded.updated_by",
        )
        .bind(key, JSON.stringify(data), now(), a.id),
      await auditStatement(a, "System setting updated: " + key),
    ]);

    // Invalidate the in-memory policy cache so the next request re-reads the
    // new value from D1 immediately — no need to wait for the 60-second TTL.
    if (key === "security") invalidatePolicyCache();

    return response({ ok: true });
  } catch (e) {
    return failure(e);
  }
}
