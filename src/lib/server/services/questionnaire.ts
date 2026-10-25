import "server-only";
import { db } from "../db";
import { Errors } from "../errors";
import { audit } from "../audit";
import { PROTOCOL, habitPresentFromAnswers, validateAnswers, type Answers } from "@/lib/shared/protocol";
import { advanceStatus, type PatientRow } from "./common";

type Actor = { type: "participant" } | { type: "staff"; userId: string };

/**
 * Saves questionnaire progress or completes it. Answers are stored as stable codes with a
 * snapshot of the question text and protocol version (FR-PAR-07). A completed questionnaire
 * is locked; replaying the same completion (same idempotency key) is a no-op success.
 */
export async function saveQuestionnaire(patientId: string, answers: Answers, complete: boolean, idempotencyKey: string, actor: Actor, correlationId: string) {
  const v = validateAnswers(answers, { requireComplete: complete });
  if (!v.ok) throw Errors.validation(v.errors);
  const d = await db();
  return d.tx(async (q) => {
    const p = (await q.query<PatientRow>("select * from patients where id = $1 for update", [patientId])).rows[0];
    if (!p || p.status === "withdrawn") throw Errors.notFound();

    const completed = (await q.query<{ id: string; idempotency_key: string | null }>(
      "select id, idempotency_key from questionnaire_submissions where patient_id = $1 and protocol_id = $2 and status = 'completed'",
      [patientId, PROTOCOL.id],
    )).rows[0];
    if (completed) {
      if (completed.idempotency_key === idempotencyKey) return { status: "completed" as const, replayed: true };
      throw Errors.conflict("This questionnaire has already been completed.", "already_completed");
    }

    let sub = (await q.query<{ id: string }>(
      "select id from questionnaire_submissions where patient_id = $1 and protocol_id = $2 and status = 'in_progress' order by started_at desc limit 1",
      [patientId, PROTOCOL.id],
    )).rows[0];
    if (!sub) {
      sub = (await q.query<{ id: string }>(
        `insert into questionnaire_submissions (patient_id, protocol_id, protocol_version, status, actor_type, actor_user_id)
         values ($1, $2, $3, 'in_progress', $4, $5) returning id`,
        [patientId, PROTOCOL.id, PROTOCOL.version, actor.type, actor.type === "staff" ? actor.userId : null],
      )).rows[0]!;
    }

    // Replace the saved answer set: hidden/cleared questions are removed.
    await q.query("delete from questionnaire_answers where submission_id = $1", [sub.id]);
    for (const question of PROTOCOL.questions) {
      const a = v.answers[question.id];
      if (a === undefined) continue;
      await q.query("insert into questionnaire_answers (submission_id, question_id, question_text, answer) values ($1, $2, $3, $4::jsonb)", [
        sub.id, question.id, question.text, JSON.stringify(a),
      ]);
    }

    if (complete) {
      await q.query("update questionnaire_submissions set status = 'completed', completed_at = now(), idempotency_key = $2 where id = $1", [sub.id, idempotencyKey]);
      await q.query("update patients set habit_present = $2, questionnaire_completed_at = now(), status = $3, updated_at = now() where id = $1", [
        patientId, habitPresentFromAnswers(v.answers), advanceStatus(p.status, "questionnaire_completed"),
      ]);
    } else {
      await q.query("update patients set status = $2, updated_at = now() where id = $1", [patientId, advanceStatus(p.status, "questionnaire_in_progress")]);
    }
    await audit({ actorType: actor.type === "staff" ? "staff" : "participant", actorId: actor.type === "staff" ? actor.userId : null, action: complete ? "questionnaire.complete" : "questionnaire.save", targetType: "patient", targetRef: patientId, outcome: "success", correlationId, details: { protocol: PROTOCOL.version } }, q);
    return { status: complete ? ("completed" as const) : ("in_progress" as const), replayed: false };
  });
}

export async function loadQuestionnaire(patientId: string) {
  const d = await db();
  const sub = (await d.query<{ id: string; status: string; protocol_version: string; completed_at: string | null }>(
    "select id, status, protocol_version, completed_at from questionnaire_submissions where patient_id = $1 order by (status = 'completed') desc, started_at desc limit 1",
    [patientId],
  )).rows[0];
  if (!sub) return { status: "not_started" as const, answers: {} as Answers, protocolVersion: PROTOCOL.version, completedAt: null, items: [] as { questionId: string; questionText: string; answer: unknown }[] };
  const rows = (await d.query<{ question_id: string; question_text: string; answer: unknown }>("select question_id, question_text, answer from questionnaire_answers where submission_id = $1", [sub.id])).rows;
  const answers: Answers = {};
  // Both pg and PGlite decode jsonb, so a single-choice answer arrives as a plain string.
  for (const r of rows) answers[r.question_id] = r.answer as string | string[];
  return {
    status: sub.status as "in_progress" | "completed",
    answers,
    protocolVersion: sub.protocol_version,
    completedAt: sub.completed_at,
    items: rows.map((r) => ({ questionId: r.question_id, questionText: r.question_text, answer: answers[r.question_id] })),
  };
}
