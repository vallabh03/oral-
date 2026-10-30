// Regression tests for the independent security review of virtual screening (one per finding).
import crypto from "node:crypto";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import sharp from "sharp";
import { db } from "@/lib/server/db";
import { objectStore } from "@/lib/server/storage";
import { resetConfigForTests } from "@/lib/server/config";
import { consoleOutbox, dispatchDue } from "@/lib/server/notify";
import { call, COMPLETE_ANSWERS, key, randomIp, registration, req, staffJar, type Jar } from "../helpers";
import * as register from "@/app/api/intake/register/route";
import * as questionnaire from "@/app/api/intake/questionnaire/route";
import * as tickets from "@/app/api/intake/virtual/uploads/route";
import * as putUpload from "@/app/api/intake/virtual/uploads/[ticketId]/route";
import * as complete from "@/app/api/intake/virtual/uploads/[ticketId]/complete/route";
import * as submit from "@/app/api/intake/virtual/submit/route";
import * as tutorial from "@/app/api/intake/virtual/tutorial/route";
import { TUTORIAL_VERSION } from "@/lib/shared/tutorial";
import * as withdraw from "@/app/api/intake/consent/withdraw/route";
import * as loginRequest from "@/app/api/intake/login/request/route";
import * as loginVerify from "@/app/api/intake/login/verify/route";
import * as caseRoute from "@/app/api/virtual/cases/[id]/route";
import * as decision from "@/app/api/virtual/cases/[id]/decision/route";
import * as staffImg from "@/app/api/virtual/images/[id]/route";
import * as imgReview from "@/app/api/virtual/images/[id]/review/route";
import * as webhook from "@/app/api/webhooks/whatsapp/route";

const photo = () => sharp(Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="900"><rect width="1200" height="900" fill="#d9b8a0"/><ellipse cx="600" cy="450" rx="380" ry="230" fill="#b04a4a"/><rect x="420" y="350" width="60" height="70" fill="#fff"/></svg>`)).jpeg().toBuffer();
const CONSENTS = { registration: true, screening: true, followupContact: true, whatsappReport: false, photo: false, remoteImages: true, reviewNotifications: true };

async function registerVirtual() {
  const jar: Jar = { cookies: {} };
  const body = registration({ screeningMode: "virtual", district: "Hyderabad", pincode: "500016", consents: CONSENTS });
  const r = await call(register.POST, req("POST", "/api/intake/register", { body, headers: { "x-forwarded-for": randomIp() } }), {}, jar);
  await call(questionnaire.POST, req("POST", "/api/intake/questionnaire", { jar, body: { answers: COMPLETE_ANSWERS, complete: true, idempotencyKey: key() } }));
  const d = await db();
  const patientId = (await d.query<{ id: string }>("select id from patients where display_id = $1", [r.json.displayId])).rows[0]!.id;
  const caseId = (await d.query<{ id: string }>("select id from virtual_cases where patient_id = $1", [patientId])).rows[0]!.id;
  await call(tutorial.POST, req("POST", "/api/intake/virtual/tutorial", { jar, body: { language: "en", version: TUTORIAL_VERSION } }));
  return { jar, displayId: r.json.displayId as string, patientId, caseId, mobile: body.mobile as string };
}
async function ticket(jar: Jar, view: string, data: Buffer) {
  const t = await call(tickets.POST, req("POST", "/api/intake/virtual/uploads", { jar, body: { view, contentType: "image/jpeg", bytes: data.length } }));
  await call(putUpload.PUT, req("PUT", t.json.uploadUrl, { jar, raw: data, headers: { "idempotency-key": t.json.ticketId } }), { ticketId: t.json.ticketId });
  return t.json.ticketId as string;
}
const completeT = (jar: Jar, id: string) => call(complete.POST, req("POST", `/api/intake/virtual/uploads/${id}/complete`, { jar }), { ticketId: id });
async function upload(jar: Jar, view: string, data?: Buffer) {
  return completeT(jar, await ticket(jar, view, data ?? (await photo())));
}
async function submitted() {
  const p = await registerVirtual();
  for (const v of ["lips", "cheek_left", "cheek_right", "upper_mouth", "lower_mouth"]) await upload(p.jar, v);
  await call(submit.POST, req("POST", "/api/intake/virtual/submit", { jar: p.jar }));
  return p;
}
const requestCode = (p: { displayId: string; mobile: string }) => call(loginRequest.POST, req("POST", "/api/intake/login/request", { body: { displayId: p.displayId, mobile: p.mobile }, headers: { "x-forwarded-for": randomIp() } }));
const verify = (p: { displayId: string; mobile: string }, code: string) => call(loginVerify.POST, req("POST", "/api/intake/login/verify", { body: { displayId: p.displayId, mobile: p.mobile, code }, headers: { "x-forwarded-for": randomIp() } }));
const wrong = (code: string) => (code === "000000" ? "111111" : "000000");

let doc: Jar;
beforeAll(async () => { doc = (await staffJar("admin")).jar; });
afterEach(() => { vi.unstubAllEnvs(); resetConfigForTests(); });

describe("virtual screening hardening", () => {
  it("1: checks the real size of a quarantined upload before reading it", async () => {
    const p = await registerVirtual();
    const id = await ticket(p.jar, "lips", await photo());
    const store = objectStore("clinical") as { size?: (k: string) => Promise<number | null> };
    store.size = async () => 5 * 1024 * 1024 * 1024; // what a presigned PUT could leave in S3
    try {
      expect((await completeT(p.jar, id)).status).toBe(413);
    } finally {
      delete store.size;
    }
    const q = (await (await db()).query<{ quarantine_key: string }>("select quarantine_key from virtual_upload_tickets where id = $1", [id])).rows[0]!;
    expect(await objectStore("clinical").get(q.quarantine_key)).toBeNull();
  });

  it("2: locks login for the day after 10 wrong guesses across codes", async () => {
    const p = await registerVirtual();
    for (let round = 0; round < 2; round++) {
      const r = await requestCode(p);
      for (let i = 0; i < 5; i++) expect((await verify(p, wrong(r.json.devCode))).status).toBe(401);
    }
    const last = await requestCode(p);
    expect((await verify(p, last.json.devCode)).status).toBe(401); // correct code, but locked
  });

  it("3: request limits and responses are identical for real and unknown details", async () => {
    const p = await registerVirtual();
    const fake = { displayId: "HAOC-DS-99999", mobile: "9000000001" };
    const statuses = async (who: typeof fake) => { const s = []; for (let i = 0; i < 4; i++) s.push((await requestCode(who)).status); return s; };
    expect(await statuses(p)).toEqual(await statuses(fake));
    expect((await statuses(fake)).at(-1)).toBe(429);
  });

  it("4: a retake deletes the unsent photo, and doctors only ever see submitted photos", async () => {
    const p = await registerVirtual();
    const first = await upload(p.jar, "lips");
    await upload(p.jar, "lips");
    const d = await db();
    const old = (await d.query<{ object_key: string; removed_at: string | null }>("select object_key, removed_at from virtual_images where id = $1", [first.json.image.id])).rows[0]!;
    expect(old.removed_at).not.toBeNull();
    expect(await objectStore("clinical").get(old.object_key)).toBeNull();
    const draft = (await upload(p.jar, "cheek_left")).json.image.id;
    expect((await call(staffImg.GET, req("GET", `/api/virtual/images/${draft}?v=preview`, { jar: doc }), { id: draft })).status).toBe(404);
    expect((await call(caseRoute.GET, req("GET", `/api/virtual/cases/${p.caseId}`, { jar: doc }), { id: p.caseId })).json.images).toHaveLength(0);
  });

  it("6: the dispatcher never re-sends a stuck login-code row (the code is not stored)", async () => {
    const p = await registerVirtual();
    const d = await db();
    const row = (await d.query<{ id: string }>("insert into notifications (patient_id, template, channel, status, attempts, idempotency_key, updated_at) values ($1, 'login_code', 'whatsapp', 'sending', 1, $2, now() - interval '1 hour') returning id", [p.patientId, `stuck-${crypto.randomUUID()}`])).rows[0]!;
    const before = consoleOutbox.length;
    await dispatchDue();
    expect((await d.query<{ status: string }>("select status from notifications where id = $1", [row.id])).rows[0]!.status).toBe("sending");
    expect(consoleOutbox.slice(before).some((m) => m.template === "login_code")).toBe(false);
  });

  it("7: after photo consent is withdrawn, photos cannot be reviewed and only an in-person outcome is allowed", async () => {
    const p = await submitted();
    const img = (await (await db()).query<{ id: string }>("select id from virtual_images where patient_id = $1 limit 1", [p.patientId])).rows[0]!.id;
    await call(withdraw.POST, req("POST", "/api/intake/consent/withdraw", { jar: p.jar, body: { consentType: "remote_images" } }));
    expect((await call(imgReview.POST, req("POST", `/api/virtual/images/${img}/review`, { jar: doc, body: { decision: "acceptable" } }), { id: img })).status).toBe(409);
    const decide = (body: unknown) => call(decision.POST, req("POST", `/api/virtual/cases/${p.caseId}/decision`, { jar: doc, body }), { id: p.caseId });
    expect((await decide({ decision: "suspicious" })).status).toBe(409);
    expect((await decide({ decision: "inconclusive", inconclusiveAction: "in_person" })).status).toBe(200);
  });

  it("8: the photo-round limit returns a clear message instead of a server error", async () => {
    const p = await submitted();
    await (await db()).query("update virtual_cases set round = 20 where id = $1", [p.caseId]);
    const r = await call(decision.POST, req("POST", `/api/virtual/cases/${p.caseId}/decision`, { jar: doc, body: { decision: "more_images", notes: "again" } }), { id: p.caseId });
    expect(r.status).toBe(409);
    expect(r.json.error.message).toMatch(/in-person/);
  });

  it("9: the WhatsApp webhook rejects oversized bodies before checking the signature", async () => {
    vi.stubEnv("NOTIFY_DRIVER", "whatsapp");
    vi.stubEnv("WHATSAPP_TOKEN", "t");
    vi.stubEnv("WHATSAPP_PHONE_NUMBER_ID", "1");
    vi.stubEnv("WHATSAPP_APP_SECRET", "test-app-secret-0123456789");
    resetConfigForTests();
    const big = "x".repeat(300 * 1024);
    const r = await call(webhook.POST, req("POST", "/api/webhooks/whatsapp", { body: big, origin: null, headers: { "x-hub-signature-256": "sha256=00" } }));
    expect(r.status).toBe(413);
  });

  it("10: pilot without messaging — no code login, nothing queued, doctors told to phone", async () => {
    vi.stubEnv("VIRTUAL_SCREENING_WITHOUT_MESSAGING", "true");
    resetConfigForTests();
    const p = await submitted();
    const d = await db();
    // Login by code says so plainly instead of pretending to send, and no code is created.
    const r = await requestCode(p);
    expect(r.status).toBe(200);
    expect(r.json.unavailable).toBe(true);
    expect(r.json.devCode).toBeUndefined();
    expect((await d.query<{ n: number }>("select count(*)::int as n from participant_otps where patient_id = $1", [p.patientId])).rows[0]!.n).toBe(0);
    // Submission and review queue nothing; the doctor is told why.
    const decided = await call(decision.POST, req("POST", `/api/virtual/cases/${p.caseId}/decision`, { jar: doc, body: { decision: "inconclusive", inconclusiveAction: "in_person" } }), { id: p.caseId });
    expect(decided.status).toBe(200);
    expect(decided.json.notification).toEqual({ skipped: "no_channel" });
    expect((await d.query<{ n: number }>("select count(*)::int as n from notifications where patient_id = $1", [p.patientId])).rows[0]!.n).toBe(0);
    const detail = await call(caseRoute.GET, req("GET", `/api/virtual/cases/${p.caseId}`, { jar: doc }), { id: p.caseId });
    expect(detail.json.messagingAvailable).toBe(false);
    expect((await d.query<{ n: number }>("select count(*)::int as n from audit_events where action = 'notification.skipped' and target_ref = $1", [p.patientId])).rows[0]!.n).toBeGreaterThanOrEqual(2);
  });

  it("11: a specialist-referral outcome with the lesion location is saved, shown and messaged with the evaluation wording", async () => {
    const p = await submitted();
    const r = await call(decision.POST, req("POST", `/api/virtual/cases/${p.caseId}/decision`, { jar: doc, body: { decision: "referral", lesionLocation: "left buccal mucosa", notes: "ulcer 1 cm", nextSteps: "ENT referral" } }), { id: p.caseId });
    expect(r.status).toBe(200);
    expect(r.json).toMatchObject({ status: "reviewed", notification: { queued: "review_suspicious" } });
    const detail = (await call(caseRoute.GET, req("GET", `/api/virtual/cases/${p.caseId}`, { jar: doc }), { id: p.caseId })).json;
    expect(detail.case).toMatchObject({ status: "reviewed", statusLabel: "Follow-up Required", outcome: "referral", lesionLocation: "left buccal mucosa", nextSteps: "ENT referral" });
    expect(detail.reviews[0]).toMatchObject({ decision: "referral", lesion_location: "left buccal mucosa" });
  });
});
