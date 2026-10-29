import { describe, expect, it } from "vitest";
import { db } from "@/lib/server/db";
import { call, COMPLETE_ANSWERS, key, randomIp, registerParticipant, registration, req, seedCamp, staffJar, syntheticPortrait, type Jar } from "../helpers";
import * as register from "@/app/api/intake/register/route";
import * as session from "@/app/api/intake/session/route";
import * as me from "@/app/api/intake/me/route";
import * as questionnaire from "@/app/api/intake/questionnaire/route";
import * as intakePhoto from "@/app/api/intake/photo/route";
import * as withdraw from "@/app/api/intake/consent/withdraw/route";
import * as patients from "@/app/api/patients/route";
import * as patient from "@/app/api/patients/[id]/route";
import * as action from "@/app/api/patients/[id]/[action]/route";
import * as photos from "@/app/api/photos/[id]/route";
import * as reports from "@/app/api/reports/[id]/route";
import { verifyAuditChain } from "@/lib/server/audit";

const act = (jar: Jar, id: string, name: string, body: unknown) => call(action.POST, req("POST", `/api/patients/${id}/${name}`, { body, jar }), { id, action: name });

describe("end-to-end screening workflow (participant → clinician → report)", () => {
  it("runs the full journey with photo capture, verification gate and audit trail", async () => {
    const camp = await seedCamp("WF-01", "Workflow camp", "Ameerpet");
    const p = await registerParticipant({ campId: camp });
    expect(p.displayId).toMatch(/^HAOC-DS-\d{4}$/);

    // Participant session: status, photo, questionnaire
    const status = await call(me.GET, req("GET", "/api/intake/me", { jar: p.jar }));
    expect(status.json).toMatchObject({ status: "registered", photoConsent: true, photoCaptured: false });
    expect(status.json).not.toHaveProperty("mobile");

    const up = await call(intakePhoto.POST, req("POST", "/api/intake/photo", { jar: p.jar, raw: await syntheticPortrait(7), headers: { "idempotency-key": key() } }));
    expect(up.status).toBe(201);

    const partial = await call(questionnaire.POST, req("POST", "/api/intake/questionnaire", { jar: p.jar, body: { answers: { habits: ["gutkha"] }, complete: false, idempotencyKey: key() } }));
    expect(partial.status).toBe(200);
    const done = await call(questionnaire.POST, req("POST", "/api/intake/questionnaire", { jar: p.jar, body: { answers: COMPLETE_ANSWERS, complete: true, idempotencyKey: key() } }));
    expect(done.json).toMatchObject({ status: "completed" });
    const again = await call(questionnaire.POST, req("POST", "/api/intake/questionnaire", { jar: p.jar, body: { answers: COMPLETE_ANSWERS, complete: true, idempotencyKey: key() } }));
    expect(again.status).toBe(409);
    // No risk group is shown to the participant before verification.
    const st2 = await call(me.GET, req("GET", "/api/intake/me", { jar: p.jar }));
    expect(st2.json.status).toBe("questionnaire_completed");
    expect(JSON.stringify(st2.json)).not.toMatch(/group/i);

    // Clinician finds the participant by ID and sees the photo thumbnail
    const { jar: doc } = await staffJar("admin");
    const found = await call(patients.GET, req("GET", `/api/patients?q=${p.displayId}`, { jar: doc }));
    expect(found.status).toBe(200);
    expect(found.json.items).toHaveLength(1);
    expect(found.json.items[0].photo.thumbUrl).toMatch(/^\/api\/photos\/[0-9a-f-]{36}\?v=thumb&p=[0-9a-f-]{36}&e=\d+&s=[0-9a-f]{32}$/);
    const thumb = await call(photos.GET, req("GET", found.json.items[0].photo.thumbUrl, { jar: doc }), { id: found.json.items[0].photo.id });
    expect(thumb.status).toBe(200);
    expect(thumb.headers.get("content-type")).toBe("image/webp");

    expect((await act(doc, p.patientId, "checkin", {})).json).toEqual({ alreadyCheckedIn: false });
    expect((await act(doc, p.patientId, "checkin", {})).json).toEqual({ alreadyCheckedIn: true });

    // Report is blocked before verification
    expect((await act(doc, p.patientId, "report", {})).status).toBe(409);

    const exam = await act(doc, p.patientId, "exam", { examCompleted: "yes", mouthOpening: "normal", oralFindings: ["leukoplakia"], lesionSites: ["left_buccal"], lesionPresent: "yes", clinicalImpression: "pmod", notes: "Synthetic note" });
    expect(exam.status).toBe(201);
    // Photography consent must be asked for a recorded lesion; this participant declines.
    expect((await act(doc, p.patientId, "verify", { examId: exam.json.examId })).status).toBe(409);
    await act(doc, p.patientId, "clinical-photo-consent", { decision: "declined" });
    const verified = await act(doc, p.patientId, "verify", { examId: exam.json.examId });
    expect(verified.json.classification).toEqual({ group: 4, pathway: "Lesion evaluation plus cessation support" });

    // Verified exams are immutable: editing requires a correction (new version)
    const noReason = await act(doc, p.patientId, "exam", { examCompleted: "yes", mouthOpening: "normal", oralFindings: ["no_abnormality"], lesionSites: [], lesionPresent: "no", clinicalImpression: "normal" });
    expect(noReason.status).toBe(422);
    const d = await db();
    await expect(d.query("update exam_records set notes = 'x' where id = $1", [exam.json.examId])).rejects.toThrow(/immutable/);

    const report = await act(doc, p.patientId, "report", {});
    expect(report.status).toBe(201);
    const r = await call(reports.GET, req("GET", `/api/reports/${report.json.reportId}`, { jar: doc }), { id: report.json.reportId });
    expect(r.json.snapshot).toMatchObject({ displayId: p.displayId, group: 4 });
    expect(r.json.snapshot.disclaimer).toMatch(/not a diagnosis/);

    const fu = await act(doc, p.patientId, "followup", { referralRequired: "priority", referralDestination: "haoc_specialist", followUpRequired: true, dueDate: "2026-11-15", cessationOutcome: "interested_referred" });
    expect(fu.status).toBe(201);

    const detail = await call(patient.GET, req("GET", `/api/patients/${p.patientId}`, { jar: doc }), { id: p.patientId });
    expect(detail.json.patient.status).toBe("follow_up_due");
    expect(detail.json.photo.fullUrl).toContain("?v=full");
    expect(detail.json.timeline.map((t: { kind: string }) => t.kind)).toEqual(expect.arrayContaining(["registration", "consent", "photo", "questionnaire", "checkin", "exam", "verify", "classification", "report", "followup"]));

    // Correction re-opens verification and clears the group until re-verified
    const corr = await act(doc, p.patientId, "exam", { examCompleted: "yes", mouthOpening: "normal", oralFindings: ["no_abnormality"], lesionSites: [], lesionPresent: "no", clinicalImpression: "normal", correctionReason: "Re-examined in better light" });
    expect(corr.json.version).toBe(2);
    const after = await call(patient.GET, req("GET", `/api/patients/${p.patientId}`, { jar: doc }), { id: p.patientId });
    expect(after.json.patient.groupCode).toBeNull();
    const v2 = await act(doc, p.patientId, "verify", { examId: corr.json.examId });
    expect(v2.json.classification.group).toBe(3);

    expect((await verifyAuditChain()).ok).toBe(true);
  });

  it("does not assign a group for uncertain lesions", async () => {
    const p = await registerParticipant();
    await call(questionnaire.POST, req("POST", "/api/intake/questionnaire", { jar: p.jar, body: { answers: COMPLETE_ANSWERS, complete: true, idempotencyKey: key() } }));
    const { jar: doc } = await staffJar("admin");
    const exam = await act(doc, p.patientId, "exam", { examCompleted: "yes", mouthOpening: "normal", oralFindings: ["ulcer"], lesionSites: ["tongue"], lesionPresent: "uncertain", clinicalImpression: "uncertain" });
    await act(doc, p.patientId, "clinical-photo-consent", { decision: "declined" });
    const v = await act(doc, p.patientId, "verify", { examId: exam.json.examId });
    expect(v.json).toMatchObject({ verified: true, classification: null, blockedReason: "lesion_uncertain" });
  });

  it("resumes with the private link and supports idempotent registration replays", async () => {
    const body = registration();
    const ip = randomIp();
    const first = await call(register.POST, req("POST", "/api/intake/register", { body, headers: { "x-forwarded-for": ip } }));
    const replay = await call(register.POST, req("POST", "/api/intake/register", { body, headers: { "x-forwarded-for": ip } }));
    expect(first.status).toBe(201);
    expect(replay.status).toBe(200);
    expect(replay.json.displayId).toBe(first.json.displayId);

    // A replay never mints a token or session (a leaked idempotency key is not a takeover).
    expect(replay.json.resumeToken).toBeUndefined();
    expect(replay.headers.getSetCookie()).toHaveLength(0);
    const jar: Jar = { cookies: {} };
    const ok = await call(session.POST, req("POST", "/api/intake/session", { body: { token: first.json.resumeToken } }), {}, jar);
    expect(ok.status).toBe(200);
    expect((await call(me.GET, req("GET", "/api/intake/me", { jar }))).json.displayId).toBe(first.json.displayId);
  });

  it("detects likely duplicates without revealing details to the public", async () => {
    const body = registration({ fullName: "Duplicate Person", mobile: "9876500001" });
    await call(register.POST, req("POST", "/api/intake/register", { body, headers: { "x-forwarded-for": randomIp() } }));
    const dup = await call(register.POST, req("POST", "/api/intake/register", { body: { ...body, idempotencyKey: key() }, headers: { "x-forwarded-for": randomIp() } }));
    expect(dup.status).toBe(409);
    expect(dup.text).not.toMatch(/HAOC-DS/);
  });

  it("withdrawing photo consent deletes the photo and blocks new uploads", async () => {
    const p = await registerParticipant();
    const up = await call(intakePhoto.POST, req("POST", "/api/intake/photo", { jar: p.jar, raw: await syntheticPortrait(3), headers: { "idempotency-key": key() } }));
    const w = await call(withdraw.POST, req("POST", "/api/intake/consent/withdraw", { jar: p.jar, body: { consentType: "photo" } }));
    expect(w.status).toBe(200);
    const { jar: doc } = await staffJar("admin");
    expect((await call(photos.GET, req("GET", `/api/photos/${up.json.id}?v=full`, { jar: doc }), { id: up.json.id })).status).toBe(404);
    const d = await db();
    expect((await d.query("select 1 from blob_objects where key like $1", [`photos/${p.patientId}/%`])).rows).toHaveLength(0);
    const blocked = await call(intakePhoto.POST, req("POST", "/api/intake/photo", { jar: p.jar, raw: await syntheticPortrait(4), headers: { "idempotency-key": key() } }));
    expect(blocked.status).toBe(409);
  });

  it("withdrawing registration ends the session, withdraws all consents and blocks further clinical steps", async () => {
    const p = await registerParticipant();
    await call(questionnaire.POST, req("POST", "/api/intake/questionnaire", { jar: p.jar, body: { answers: COMPLETE_ANSWERS, complete: true, idempotencyKey: key() } }));
    const { jar: doc } = await staffJar("admin");
    const exam = await act(doc, p.patientId, "exam", { examCompleted: "yes", mouthOpening: "normal", oralFindings: ["no_abnormality"], lesionSites: [], lesionPresent: "no", clinicalImpression: "normal" });
    await call(withdraw.POST, req("POST", "/api/intake/consent/withdraw", { jar: p.jar, body: { consentType: "registration" } }));
    expect((await call(me.GET, req("GET", "/api/intake/me", { jar: p.jar }))).status).toBe(401);
    expect((await act(doc, p.patientId, "verify", { examId: exam.json.examId })).status).toBe(409);
    expect((await act(doc, p.patientId, "report", {})).status).toBe(409);
    const d = await db();
    const granted = await d.query(
      "select 1 from (select distinct on (consent_type) status from consents where patient_id = $1 order by consent_type, created_at desc, id desc) c where status = 'granted'", [p.patientId]);
    expect(granted.rows).toHaveLength(0);
  });

  it("supports camp-assisted registration with staff photo capture", async () => {
    const { jar: doc } = await staffJar("admin");
    const r = await call(patients.POST, req("POST", "/api/patients", { jar: doc, body: registration() }));
    expect(r.status).toBe(201);
    const { POST } = await import("@/app/api/patients/[id]/photo/route");
    const up = await call(POST, req("POST", `/api/patients/${r.json.id}/photo`, { jar: doc, raw: await syntheticPortrait(9), headers: { "idempotency-key": key() } }), { id: r.json.id });
    expect(up.status).toBe(201);
    const d = await db();
    expect((await d.query<{ captured_by_type: string }>("select captured_by_type from patient_photos where id = $1", [up.json.id])).rows[0]!.captured_by_type).toBe("staff");
  });
});
