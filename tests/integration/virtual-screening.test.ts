// PRD addendum — virtual registration, patient-captured mouth images, doctor review and patient
// notifications. Synthetic images and synthetic participants only.
import crypto from "node:crypto";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import sharp from "sharp";
import { db } from "@/lib/server/db";
import { objectStore } from "@/lib/server/storage";
import { resetConfigForTests } from "@/lib/server/config";
import { consoleOutbox, dispatchDue, pollLeminaiStatuses } from "@/lib/server/notify";
import { call, COMPLETE_ANSWERS, key, randomIp, registration, req, staffJar, type Jar } from "../helpers";
import * as register from "@/app/api/intake/register/route";
import * as questionnaire from "@/app/api/intake/questionnaire/route";
import * as vcase from "@/app/api/intake/virtual/route";
import * as tickets from "@/app/api/intake/virtual/uploads/route";
import * as putUpload from "@/app/api/intake/virtual/uploads/[ticketId]/route";
import * as complete from "@/app/api/intake/virtual/uploads/[ticketId]/complete/route";
import * as ownImage from "@/app/api/intake/virtual/images/[imageId]/route";
import * as assistance from "@/app/api/intake/virtual/assistance/route";
import * as submit from "@/app/api/intake/virtual/submit/route";
import * as tutorial from "@/app/api/intake/virtual/tutorial/route";
import { TUTORIAL_VERSION } from "@/lib/shared/tutorial";
import { SUBMITTED_MESSAGE } from "@/lib/shared/virtual";
import * as loginRequest from "@/app/api/intake/login/request/route";
import * as loginVerify from "@/app/api/intake/login/verify/route";
import * as queue from "@/app/api/virtual/cases/route";
import * as caseRoute from "@/app/api/virtual/cases/[id]/route";
import * as decision from "@/app/api/virtual/cases/[id]/decision/route";
import * as followup from "@/app/api/virtual/cases/[id]/followup/route";
import * as staffImg from "@/app/api/virtual/images/[id]/route";
import * as imgReview from "@/app/api/virtual/images/[id]/review/route";
import * as retry from "@/app/api/notifications/[id]/retry/route";
import * as webhook from "@/app/api/webhooks/whatsapp/route";
import * as withdraw from "@/app/api/intake/consent/withdraw/route";

// A synthetic "mouth" photo: smooth shapes with edges (sharp), carrying GPS/device EXIF to strip.
const mouthPhoto = async (opts: { blur?: number; dark?: boolean } = {}) => {
  const svg = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="1200"><rect width="1600" height="1200" fill="#d9b8a0"/><ellipse cx="800" cy="600" rx="500" ry="300" fill="#b04a4a"/><ellipse cx="800" cy="600" rx="380" ry="180" fill="#e8a0a0"/><rect x="560" y="470" width="80" height="90" fill="#fff"/><rect x="760" y="470" width="80" height="90" fill="#fff"/><circle cx="900" cy="700" r="25" fill="#f4f4f4"/></svg>`);
  let s = sharp(svg);
  if (opts.blur) s = s.blur(opts.blur);
  if (opts.dark) s = s.linear(0.12, 0);
  return s.jpeg({ quality: 90 }).withExif({ IFD0: { Make: "SyntheticPhoneCo" }, IFD3: { GPSLatitudeRef: "N", GPSLatitude: "17/1 23/1 0/1" } }).toBuffer();
};

const VIRTUAL_CONSENTS = { registration: true, screening: true, followupContact: true, whatsappReport: false, photo: false, remoteImages: true, reviewNotifications: true };

const watchGuide = (jar: Jar, body: Record<string, unknown> = { language: "te", version: TUTORIAL_VERSION }) =>
  call(tutorial.POST, req("POST", "/api/intake/virtual/tutorial", { jar, body }));

async function registerVirtual(overrides: Record<string, unknown> = {}, opts: { guide?: boolean } = {}) {
  const jar: Jar = { cookies: {} };
  const body = registration({ screeningMode: "virtual", district: "Hyderabad", mandal: "Ameerpet", pincode: "500016", addressLine: "Synthetic Street 1", consents: VIRTUAL_CONSENTS, ...overrides });
  const r = await call(register.POST, req("POST", "/api/intake/register", { body, headers: { "x-forwarded-for": randomIp() } }), {}, jar);
  if (r.status !== 201) throw new Error(`register ${r.status} ${r.text}`);
  await call(questionnaire.POST, req("POST", "/api/intake/questionnaire", { jar, body: { answers: COMPLETE_ANSWERS, complete: true, idempotencyKey: key() } }));
  const patientId = (await (await db()).query<{ id: string }>("select id from patients where display_id = $1", [r.json.displayId])).rows[0]!.id;
  if (opts.guide !== false) expect((await watchGuide(jar)).status).toBe(200);
  return { jar, displayId: r.json.displayId as string, patientId, mobile: body.mobile as string };
}

/** Full patient upload: ticket → PUT bytes → complete. */
async function uploadView(jar: Jar, view: string, data: Buffer, contentType = "image/jpeg") {
  const t = await call(tickets.POST, req("POST", "/api/intake/virtual/uploads", { jar, body: { view, contentType, bytes: data.length } }));
  if (t.status !== 201) return { ticket: t, done: t };
  const put = await call(putUpload.PUT, req("PUT", t.json.uploadUrl, { jar, raw: data, contentType, headers: { "idempotency-key": t.json.ticketId } }), { ticketId: t.json.ticketId });
  if (put.status !== 200) return { ticket: t, done: put };
  const done = await call(complete.POST, req("POST", `/api/intake/virtual/uploads/${t.json.ticketId}/complete`, { jar }), { ticketId: t.json.ticketId });
  return { ticket: t, done };
}

async function uploadRequired(jar: Jar) {
  const img = await mouthPhoto();
  for (const v of ["lips", "cheek_left", "cheek_right", "upper_mouth", "lower_mouth"]) {
    const r = await uploadView(jar, v, img);
    expect(r.done.status, `${v}: ${r.done.text}`).toBe(201);
  }
}

const caseOf = async (patientId: string) => (await (await db()).query<{ id: string; status: string; round: number }>("select id, status, round from virtual_cases where patient_id = $1", [patientId])).rows[0]!;
const decide = (jar: Jar, id: string, body: unknown) => call(decision.POST, req("POST", `/api/virtual/cases/${id}/decision`, { jar, body }), { id });
const detail = (jar: Jar, id: string) => call(caseRoute.GET, req("GET", `/api/virtual/cases/${id}`, { jar }), { id });
const reviewImg = (jar: Jar, id: string, body: unknown) => call(imgReview.POST, req("POST", `/api/virtual/images/${id}/review`, { jar, body }), { id });
/** Latest console message of a template for a number (a background send may finish in any order). */
const messageFor = (template: string, mobile: string) => consoleOutbox.findLast((m) => m.template === template && m.to === `91${mobile}`);

const c = {} as { doc: Jar; superAdmin: Jar; assistant: Jar };
beforeAll(async () => {
  c.doc = (await staffJar("admin")).jar;
  c.superAdmin = (await staffJar("super_admin")).jar;
  c.assistant = (await staffJar("assistant")).jar;
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  resetConfigForTests();
});

describe("virtual registration", () => {
  it("requires mobile and photo consent, keeps district and PIN optional, stores the location and opens a case", async () => {
    const send = (body: unknown) => call(register.POST, req("POST", "/api/intake/register", { body, headers: { "x-forwarded-for": randomIp() } }));
    const missing = await send(registration({ screeningMode: "virtual", consents: { ...VIRTUAL_CONSENTS, remoteImages: false } }));
    expect(missing.status).toBe(422);
    expect(Object.keys(missing.json.error.fields)).not.toEqual(expect.arrayContaining(["district"]));
    expect(Object.keys(missing.json.error.fields)).not.toEqual(expect.arrayContaining(["pincode"]));
    const noLocation = await send(registration({ screeningMode: "virtual", consents: VIRTUAL_CONSENTS }));
    expect(noLocation.status).toBe(201);
    const noConsent = await send(registration({ screeningMode: "virtual", district: "Hyderabad", pincode: "500016", consents: { ...VIRTUAL_CONSENTS, remoteImages: false } }));
    expect(noConsent.json.error.fields).toHaveProperty(["consents.remoteImages"]);
    const wrongMode = await send(registration({ consents: { ...VIRTUAL_CONSENTS, reviewNotifications: false } }));
    expect(wrongMode.json.error.fields).toHaveProperty(["consents.remoteImages"]);
    const badPin = await send(registration({ screeningMode: "virtual", district: "Hyderabad", pincode: "012345", consents: VIRTUAL_CONSENTS }));
    expect(badPin.json.error.fields).toHaveProperty("pincode");

    const p = await registerVirtual();
    const row = (await (await db()).query("select district, mandal, pincode, address_line, screening_mode from patients where id = $1", [p.patientId])).rows[0];
    expect(row).toEqual({ district: "Hyderabad", mandal: "Ameerpet", pincode: "500016", address_line: "Synthetic Street 1", screening_mode: "virtual" });
    expect((await caseOf(p.patientId)).status).toBe("awaiting_images");
    const me = await call(vcase.GET, req("GET", "/api/intake/virtual", { jar: p.jar }));
    expect(me.json).toMatchObject({ status: "awaiting_images", canEdit: true, imagesConsent: true });
    expect(me.json.missingRecommended).toEqual(["lips", "cheek_left", "cheek_right", "upper_mouth", "lower_mouth"]);
  });
});

describe("patient-captured images", () => {
  it("uploads through quarantine, strips GPS/device metadata, flags quality and keeps images private", async () => {
    const p = await registerVirtual();
    const r = await uploadView(p.jar, "lips", await mouthPhoto());
    expect(r.done.status).toBe(201);
    expect(r.done.json.warnings).toEqual([]);
    const d = await db();
    const img = (await d.query<{ object_key: string; metadata_removed: string[]; quality: { flags: string[] } }>("select object_key, metadata_removed, quality from virtual_images where id = $1", [r.done.json.image.id])).rows[0]!;
    expect(img.metadata_removed).toContain("exif");
    const stored = (await objectStore("clinical").get(img.object_key))!.data;
    expect(stored.includes(Buffer.from("SyntheticPhoneCo"))).toBe(false);
    expect(stored.includes(Buffer.from("GPS"))).toBe(false);
    // Quarantine object is gone and the ticket cannot be reused for new bytes.
    const t = (await d.query<{ quarantine_key: string }>("select quarantine_key from virtual_upload_tickets where id = $1", [r.ticket.json.ticketId])).rows[0]!;
    expect(await objectStore("clinical").get(t.quarantine_key)).toBeNull();
    const reuse = await call(putUpload.PUT, req("PUT", r.ticket.json.uploadUrl, { jar: p.jar, raw: await mouthPhoto(), headers: { "idempotency-key": r.ticket.json.ticketId } }), { ticketId: r.ticket.json.ticketId });
    expect(reuse.status).toBe(410);
    // Completing again returns the same image (retry-safe).
    const again = await call(complete.POST, req("POST", `/api/intake/virtual/uploads/${r.ticket.json.ticketId}/complete`, { jar: p.jar }), { ticketId: r.ticket.json.ticketId });
    expect(again.json.image.id).toBe(r.done.json.image.id);

    // Dark and blurry photos are accepted but come back with clear instructions.
    const dark = await uploadView(p.jar, "cheek_left", await mouthPhoto({ dark: true }));
    expect(dark.done.json.image.flags).toContain("too_dark");
    expect(dark.done.json.warnings.join(" ")).toMatch(/too dark/);
    const blurry = await uploadView(p.jar, "cheek_right", await mouthPhoto({ blur: 8 }));
    expect(blurry.done.json.image.flags).toContain("blurry");

    // Own preview is visible; another participant gets 404 for the same image.
    const own = await call(ownImage.GET, req("GET", `/api/intake/virtual/images/${r.done.json.image.id}`, { jar: p.jar }), { imageId: r.done.json.image.id });
    expect(own.status).toBe(200);
    expect(own.headers.get("cache-control")).toContain("no-store");
    const other = await registerVirtual();
    const peek = await call(ownImage.GET, req("GET", `/api/intake/virtual/images/${r.done.json.image.id}`, { jar: other.jar }), { imageId: r.done.json.image.id });
    expect(peek.status).toBe(404);
    const steal = await call(complete.POST, req("POST", `/api/intake/virtual/uploads/${r.ticket.json.ticketId}/complete`, { jar: other.jar }), { ticketId: r.ticket.json.ticketId });
    expect(steal.status).toBe(404);

    // Remove before submitting deletes the bytes.
    const rm = await call(ownImage.DELETE, req("DELETE", `/api/intake/virtual/images/${blurry.done.json.image.id}`, { jar: p.jar }), { imageId: blurry.done.json.image.id });
    expect(rm.status).toBe(200);
    const removed = (await d.query<{ object_key: string }>("select object_key from virtual_images where id = $1", [blurry.done.json.image.id])).rows[0]!;
    expect(await objectStore("clinical").get(removed.object_key)).toBeNull();
  });

  it("rejects non-images, oversize declarations and uploads without consent", async () => {
    const p = await registerVirtual();
    const fake = await uploadView(p.jar, "lips", Buffer.from("<svg onload=alert(1)>not a photo</svg>"));
    expect(fake.done.status).toBe(415);
    const huge = await call(tickets.POST, req("POST", "/api/intake/virtual/uploads", { jar: p.jar, body: { view: "lips", contentType: "image/jpeg", bytes: 50_000_000 } }));
    expect(huge.status).toBe(413);
    const badView = await call(tickets.POST, req("POST", "/api/intake/virtual/uploads", { jar: p.jar, body: { view: "../etc", contentType: "image/jpeg", bytes: 10 } }));
    expect(badView.status).toBe(422);
    // An in-person participant has no virtual case.
    const jar: Jar = { cookies: {} };
    await call(register.POST, req("POST", "/api/intake/register", { body: registration(), headers: { "x-forwarded-for": randomIp() } }), {}, jar);
    const none = await call(tickets.POST, req("POST", "/api/intake/virtual/uploads", { jar, body: { view: "lips", contentType: "image/jpeg", bytes: 10 } }));
    expect(none.status).toBe(404);
  });

  it("accepts any clear photos: recommended views are advice, at least one photo is the only rule", async () => {
    const p = await registerVirtual();
    const empty = await call(submit.POST, req("POST", "/api/intake/virtual/submit", { jar: p.jar }));
    expect(empty.status).toBe(422);
    await uploadView(p.jar, "lips", await mouthPhoto());
    const before = await call(vcase.GET, req("GET", "/api/intake/virtual", { jar: p.jar }));
    expect(before.json.missingRecommended).toEqual(["cheek_left", "cheek_right", "upper_mouth", "lower_mouth"]);
    const help = await call(assistance.POST, req("POST", "/api/intake/virtual/assistance", { jar: p.jar, body: { note: "I cannot photograph under my tongue" } }));
    expect(help.json.clinic.phone).toBeTruthy();
    const ok = await call(submit.POST, req("POST", "/api/intake/virtual/submit", { jar: p.jar })); // one photo is enough
    expect(ok.status).toBe(200);
    const after = await uploadView(p.jar, "concern", await mouthPhoto());
    expect(after.done.status).toBe(409); // submitted photos are locked until the doctor asks for more
  });
});

describe("doctor review and patient notifications", () => {
  it("runs the whole review: retake request → resubmission → no suspicious lesion, with messages and audit", async () => {
    const p = await registerVirtual();
    await uploadRequired(p.jar);
    expect((await call(submit.POST, req("POST", "/api/intake/virtual/submit", { jar: p.jar }))).status).toBe(200);
    await dispatchDue();
    expect(messageFor("submission_received", p.mobile)).toBeTruthy();

    const q = await call(queue.GET, req("GET", "/api/virtual/cases?status=awaiting_review", { jar: c.doc }));
    const item = q.json.items.find((i: { displayId: string }) => i.displayId === p.displayId);
    expect(item.thumbs).toHaveLength(4);
    const caseId = item.id as string;

    const d1 = await detail(c.doc, caseId);
    expect(d1.json.case.status).toBe("in_review");
    expect(d1.json.patient).toMatchObject({ district: "Hyderabad", pincode: "500016" });
    expect(d1.json.questionnaire.items.length).toBeGreaterThan(5);
    const images = d1.json.images as { id: string; view: string; fullUrl: string }[];
    expect(images).toHaveLength(5);

    // Images load directly for the doctor (full size is audited).
    const full = await call(staffImg.GET, req("GET", images[0]!.fullUrl, { jar: c.doc }), { id: images[0]!.id });
    expect(full.status).toBe(200);
    expect(full.headers.get("content-type")).toBe("image/jpeg");

    // "No suspicious lesion" is blocked until every image is reviewed acceptable.
    expect((await decide(c.doc, caseId, { decision: "no_suspicious" })).status).toBe(409);
    const lips = images.find((i) => i.view === "lips")!;
    for (const i of images) await reviewImg(c.doc, i.id, { decision: i.id === lips.id ? "needs_retake" : "acceptable", note: i.id === lips.id ? "Out of focus" : undefined });
    const more = await decide(c.doc, caseId, { decision: "more_images", notes: "Lips photo blurred" });
    expect(more.json).toMatchObject({ status: "more_images_requested", notification: { queued: "review_more_images" } });
    await dispatchDue();
    expect(messageFor("review_more_images", p.mobile)!.text).toMatch(/we need clearer images/);

    // Patient sees the retake request, replaces only that view and resubmits.
    const me = await call(vcase.GET, req("GET", "/api/intake/virtual", { jar: p.jar }));
    expect(me.json).toMatchObject({ status: "more_images_requested", canEdit: true, missingRecommended: ["lips"] });
    expect(me.json.images.find((i: { view: string }) => i.view === "lips").retakeRequested).toBe(true);
    expect((await uploadView(p.jar, "lips", await mouthPhoto())).done.status).toBe(201);
    expect((await call(submit.POST, req("POST", "/api/intake/virtual/submit", { jar: p.jar }))).status).toBe(200);

    const d2 = await detail(c.doc, caseId);
    const newLips = d2.json.images.find((i: { view: string; current: boolean }) => i.view === "lips" && i.current);
    expect(newLips.round).toBe(2);
    expect(d2.json.images.filter((i: { view: string }) => i.view === "lips")).toHaveLength(2); // history kept
    await reviewImg(c.doc, newLips.id, { decision: "acceptable" });
    const done = await decide(c.doc, caseId, { decision: "no_suspicious", notes: "Synthetic: normal mucosa", nextSteps: "Routine annual check" });
    expect(done.json).toMatchObject({ status: "reviewed", notification: { queued: "review_no_lesion" } });
    await dispatchDue();
    const noLesion = messageFor("review_no_lesion", p.mobile)!;
    expect(noLesion.text).toMatch(/No suspicious lesion was identified.*does not rule out oral disease/);
    // Messages carry no images, notes or diagnosis detail.
    expect(noLesion.text).not.toMatch(/normal mucosa|annual/);

    const d3 = await detail(c.doc, caseId);
    expect(d3.json.case).toMatchObject({ outcome: "no_suspicious", reviewedBy: "Test admin", canDecide: false });
    expect(d3.json.reviews.map((r: { decision: string }) => r.decision)).toEqual(["no_suspicious", "more_images"]);
    expect(d3.json.notifications.map((n: { template: string; status: string }) => `${n.template}:${n.status}`)).toEqual(expect.arrayContaining(["review_no_lesion:sent", "review_more_images:sent", "submission_received:sent"]));
    expect((await decide(c.doc, caseId, { decision: "suspicious" })).status).toBe(409); // no silent re-decision

    expect((await call(followup.POST, req("POST", `/api/virtual/cases/${caseId}/followup`, { jar: c.doc, body: { action: "closed", note: "Advised routine check" } }), { id: caseId })).status).toBe(200);
    expect((await caseOf(p.patientId)).status).toBe("closed");

    const audits = (await (await db()).query<{ action: string }>("select action from audit_events where target_ref = $1", [p.patientId])).rows.map((r) => r.action);
    for (const a of ["virtual_image.upload", "virtual_case.submit", "virtual_case.view", "virtual_image.view", "virtual_image.review", "virtual_case.review", "notification.queued", "virtual_case.followup"]) expect(audits).toContain(a);
  });

  it("sends the 'further evaluation' message for suspicious and inconclusive-in-person outcomes", async () => {
    for (const body of [{ decision: "suspicious", notes: "Synthetic: white patch left cheek" }, { decision: "inconclusive", inconclusiveAction: "in_person" }]) {
      const p = await registerVirtual();
      await uploadRequired(p.jar);
      await call(submit.POST, req("POST", "/api/intake/virtual/submit", { jar: p.jar }));
      const r = await decide(c.doc, (await caseOf(p.patientId)).id, body);
      expect(r.json).toMatchObject({ status: "reviewed", notification: { queued: "review_suspicious" } });
      await dispatchDue();
      expect(messageFor("review_suspicious", p.mobile)!.text).toMatch(/Further clinical evaluation is recommended.*not a confirmed diagnosis/);
      const me = await call(vcase.GET, req("GET", "/api/intake/virtual", { jar: p.jar }));
      expect(me.json.resultMessage).toMatch(/Further clinical evaluation/);
      expect(JSON.stringify(me.json)).not.toMatch(/white patch/); // doctor notes never reach the patient
    }
  });

  it("requires review-message consent to register for virtual screening", async () => {
    await expect(registerVirtual({ consents: { ...VIRTUAL_CONSENTS, reviewNotifications: false } })).rejects.toThrow(/consents.reviewNotifications/);
  });

  it("skips messages once consent is withdrawn and lets the doctor know", async () => {
    const p = await registerVirtual();
    expect((await call(withdraw.POST, req("POST", "/api/intake/consent/withdraw", { jar: p.jar, body: { consentType: "review_notifications" } }))).status).toBe(200);
    await uploadRequired(p.jar);
    await call(submit.POST, req("POST", "/api/intake/virtual/submit", { jar: p.jar }));
    const r = await decide(c.doc, (await caseOf(p.patientId)).id, { decision: "suspicious" });
    expect(r.json.notification).toEqual({ skipped: "no_consent" });
    expect((await (await db()).query("select 1 from notifications where patient_id = $1", [p.patientId])).rows).toHaveLength(0);
  });

  it("allows only doctors: Super Admin, Assistant and participants are refused", async () => {
    const p = await registerVirtual();
    await uploadRequired(p.jar);
    await call(submit.POST, req("POST", "/api/intake/virtual/submit", { jar: p.jar }));
    const caseId = (await caseOf(p.patientId)).id;
    const img = (await (await db()).query<{ id: string }>("select id from virtual_images where patient_id = $1 limit 1", [p.patientId])).rows[0]!.id;
    for (const jar of [c.superAdmin, c.assistant]) {
      expect((await call(queue.GET, req("GET", "/api/virtual/cases", { jar }))).status).toBe(403);
      expect((await detail(jar, caseId)).status).toBe(403);
      expect((await call(staffImg.GET, req("GET", `/api/virtual/images/${img}?v=full`, { jar }), { id: img })).status).toBe(403);
      expect((await decide(jar, caseId, { decision: "suspicious" })).status).toBe(403);
    }
    expect((await call(staffImg.GET, req("GET", `/api/virtual/images/${img}?v=full`, { jar: p.jar }), { id: img })).status).toBe(401);
    // Withdrawing photo consent hides the images from doctors too.
    expect((await call(staffImg.GET, req("GET", `/api/virtual/images/${img}?v=preview`, { jar: c.doc }), { id: img })).status).toBe(200);
    expect((await call(withdraw.POST, req("POST", "/api/intake/consent/withdraw", { jar: p.jar, body: { consentType: "remote_images" } }))).status).toBe(200);
    expect((await call(staffImg.GET, req("GET", `/api/virtual/images/${img}?v=preview`, { jar: c.doc }), { id: img })).status).toBe(404);
    expect((await detail(c.doc, caseId)).json).toMatchObject({ imagesHidden: true, images: [] });
    expect((await call(staffImg.GET, req("GET", `/api/virtual/images/${img}?v=full`), { id: img })).status).toBe(401);
  });
});

describe("WhatsApp delivery: retries, failures, status callbacks and STOP", () => {
  it("retries transient failures, records the provider id, tracks delivery and honours STOP", async () => {
    const p = await registerVirtual();
    await uploadRequired(p.jar);
    vi.stubEnv("NOTIFY_DRIVER", "whatsapp");
    vi.stubEnv("WHATSAPP_TOKEN", "test-token");
    vi.stubEnv("WHATSAPP_PHONE_NUMBER_ID", "1234567890");
    vi.stubEnv("WHATSAPP_APP_SECRET", "test-app-secret-0123456789");
    resetConfigForTests();
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ error: { code: 1 } }), { status: 503 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ messages: [{ id: "wamid.TEST1" }] }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await call(submit.POST, req("POST", "/api/intake/virtual/submit", { jar: p.jar }));
    const d = await db();
    await dispatchDue();
    let n = (await d.query<{ id: string; status: string; attempts: number; last_error: string }>("select id, status, attempts, last_error from notifications where patient_id = $1", [p.patientId])).rows[0]!;
    expect(n).toMatchObject({ status: "queued", attempts: 1, last_error: "http_503_1" });
    await d.query("update notifications set next_attempt_at = now() where id = $1", [n.id]);
    await dispatchDue();
    n = (await d.query<{ id: string; status: string; attempts: number; last_error: string }>("select id, status, attempts, last_error from notifications where id = $1", [n.id])).rows[0]!;
    expect(n.status).toBe("sent");
    const sentBody = JSON.parse(fetchMock.mock.calls[1]![1].body as string);
    expect(sentBody).toMatchObject({ to: `91${p.mobile}`, type: "template", template: { name: "submission_received" } });
    expect(JSON.stringify(sentBody)).not.toMatch(/image|jpeg|base64/i);

    // Signed status callback moves it forward; an unsigned one is rejected.
    const sign = (raw: string) => "sha256=" + crypto.createHmac("sha256", "test-app-secret-0123456789").update(raw).digest("hex");
    const statusRaw = JSON.stringify({ entry: [{ changes: [{ value: { statuses: [{ id: "wamid.TEST1", status: "delivered" }] } }] }] });
    expect((await call(webhook.POST, req("POST", "/api/webhooks/whatsapp", { body: statusRaw, origin: null, headers: { "x-hub-signature-256": "sha256=bad" } }))).status).toBe(401);
    expect((await call(webhook.POST, req("POST", "/api/webhooks/whatsapp", { body: statusRaw, origin: null, headers: { "x-hub-signature-256": sign(statusRaw) } }))).status).toBe(200);
    expect((await d.query<{ status: string }>("select status from notifications where id = $1", [n.id])).rows[0]!.status).toBe("delivered");

    // A permanent failure is recorded as failed and can be resent by a doctor.
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ error: { code: 131026 } }), { status: 400 }));
    const caseId = (await caseOf(p.patientId)).id;
    await decide(c.doc, caseId, { decision: "suspicious" });
    await dispatchDue();
    const failed = (await d.query<{ id: string; status: string }>("select id, status from notifications where patient_id = $1 and template = 'review_suspicious'", [p.patientId])).rows[0]!;
    expect(failed.status).toBe("failed");
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ messages: [{ id: "wamid.TEST2" }] }), { status: 200 }));
    expect((await call(retry.POST, req("POST", `/api/notifications/${failed.id}/retry`, { jar: c.doc }), { id: failed.id })).status).toBe(200);
    await dispatchDue();
    expect((await d.query<{ status: string }>("select status from notifications where id = $1", [failed.id])).rows[0]!.status).toBe("sent");

    // STOP withdraws message consent; nothing more is sent.
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ messages: [{ id: "wamid.X" }] }), { status: 200 }));
    const stopRaw = JSON.stringify({ entry: [{ changes: [{ value: { messages: [{ from: `91${p.mobile}`, type: "text", text: { body: "STOP" } }] } }] }] });
    await call(webhook.POST, req("POST", "/api/webhooks/whatsapp", { body: stopRaw, origin: null, headers: { "x-hub-signature-256": sign(stopRaw) } }));
    const consent = (await d.query<{ status: string }>("select status from consents where patient_id = $1 and consent_type = 'review_notifications' order by created_at desc limit 1", [p.patientId])).rows[0]!;
    expect(consent.status).toBe("withdrawn");
  });
});

describe("LeminAi delivery: same templates through the Wrapper API", () => {
  it("sends approved templates with text variables only, retries transient failures and looks up delivery status", async () => {
    const p = await registerVirtual();
    await uploadRequired(p.jar);
    vi.stubEnv("NOTIFY_DRIVER", "leminai");
    vi.stubEnv("LEMINAI_API_KEY", "test-leminai-key");
    vi.stubEnv("LEMINAI_BASE_URL", "https://lemin.example.test/");
    resetConfigForTests();
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ error: "server_error" }), { status: 502 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ success: true, message_id: 351, wamid: "wamid.LEMIN1" }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await call(submit.POST, req("POST", "/api/intake/virtual/submit", { jar: p.jar }));
    const d = await db();
    await dispatchDue();
    let n = (await d.query<{ id: string; status: string; last_error: string; provider_message_id: string | null }>("select id, status, last_error, provider_message_id from notifications where patient_id = $1", [p.patientId])).rows[0]!;
    expect(n).toMatchObject({ status: "queued", last_error: "http_502_server_error" });
    await d.query("update notifications set next_attempt_at = now() where id = $1", [n.id]);
    await dispatchDue();
    n = (await d.query<{ id: string; status: string; last_error: string; provider_message_id: string | null }>("select id, status, last_error, provider_message_id from notifications where id = $1", [n.id])).rows[0]!;
    expect(n).toMatchObject({ status: "sent", provider_message_id: "leminai:351" });

    const [url, init] = fetchMock.mock.calls[1]!;
    expect(url).toBe("https://lemin.example.test/api/v1/messages/template");
    expect(init.headers.authorization).toBe("Bearer test-leminai-key");
    const sent = JSON.parse(init.body as string);
    expect(sent).toEqual({
      to: `91${p.mobile}`, template_name: "submission_received", language: "en",
      components: [{ type: "body", parameters: [{ type: "text", text: expect.any(String) }, { type: "text", text: p.displayId }] }],
    });
    expect(JSON.stringify(sent)).not.toMatch(/image|jpeg|base64|link/i);

    // No callback from LeminAi: the worker looks the status up (not more than every two minutes).
    expect(await pollLeminaiStatuses()).toBe(0);
    await d.query("update notifications set updated_at = now() - interval '5 minutes' where id = $1", [n.id]);
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ data: { id: 351, status: "delivered" } }), { status: 200 }));
    expect(await pollLeminaiStatuses()).toBe(1);
    expect(fetchMock.mock.calls.at(-1)![0]).toBe("https://lemin.example.test/api/v1/messages/351");
    expect((await d.query<{ status: string }>("select status from notifications where id = $1", [n.id])).rows[0]!.status).toBe("delivered");
    // Never moves backwards.
    await d.query("update notifications set updated_at = now() - interval '5 minutes' where id = $1", [n.id]);
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ status: "sent" }), { status: 200 }));
    await pollLeminaiStatuses();
    expect((await d.query<{ status: string }>("select status from notifications where id = $1", [n.id])).rows[0]!.status).toBe("delivered");

    // A rejected template (permanent 4xx) is marked failed, not retried.
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ error: "template_not_found" }), { status: 422 }));
    await decide(c.doc, (await caseOf(p.patientId)).id, { decision: "suspicious" });
    await dispatchDue();
    const failed = (await d.query<{ status: string; last_error: string }>("select status, last_error from notifications where patient_id = $1 and template = 'review_suspicious'", [p.patientId])).rows[0]!;
    expect(failed).toMatchObject({ status: "failed", last_error: "http_422_template_not_found" });
  });

  it("sends the login code with the code on the button too", async () => {
    const p = await registerVirtual();
    vi.stubEnv("NOTIFY_DRIVER", "leminai");
    vi.stubEnv("LEMINAI_API_KEY", "test-leminai-key");
    vi.stubEnv("LEMINAI_BASE_URL", "https://lemin.example.test");
    resetConfigForTests();
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ message_id: 9 }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const r = await call(loginRequest.POST, req("POST", "/api/intake/login/request", { body: { displayId: p.displayId, mobile: p.mobile }, headers: { "x-forwarded-for": randomIp() } }));
    expect(r.json.devCode).toBeUndefined(); // codes are only shown with the console driver
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const sent = JSON.parse(fetchMock.mock.calls[0]![1].body as string);
    const code = sent.components[0].parameters[0].text;
    expect(code).toMatch(/^\d{6}$/);
    expect(sent).toMatchObject({ template_name: "login_code", components: [{ type: "body" }, { type: "button", sub_type: "url", index: 0, parameters: [{ type: "text", text: code }] }] });
  });
});

describe("login codes switched off (authentication template not approved)", () => {
  it("still queues result messages but never sends or stores a login code", async () => {
    const p = await registerVirtual();
    vi.stubEnv("LOGIN_CODES_ENABLED", "false");
    resetConfigForTests();
    const before = consoleOutbox.length;
    const r = await call(loginRequest.POST, req("POST", "/api/intake/login/request", { body: { displayId: p.displayId, mobile: p.mobile }, headers: { "x-forwarded-for": randomIp() } }));
    expect(r.json).toMatchObject({ unavailable: true });
    expect(r.json.message).toMatch(/resume link/);
    expect(r.json.devCode).toBeUndefined();
    const d = await db();
    expect((await d.query<{ n: number }>("select count(*)::int as n from participant_otps where patient_id = $1", [p.patientId])).rows[0]!.n).toBe(0);
    expect(consoleOutbox.slice(before).some((m) => m.template === "login_code")).toBe(false);

    await uploadRequired(p.jar);
    await call(submit.POST, req("POST", "/api/intake/virtual/submit", { jar: p.jar }));
    expect((await d.query<{ template: string }>("select template from notifications where patient_id = $1", [p.patientId])).rows.map((x) => x.template)).toContain("submission_received");
  });
});

describe("returning participants: WhatsApp login code", () => {
  it("logs in with participant ID + mobile + code, limits guesses and never reveals whether an account exists", async () => {
    const p = await registerVirtual();
    const ip = randomIp();
    const unknown = await call(loginRequest.POST, req("POST", "/api/intake/login/request", { body: { displayId: "HAOC-DS-9999", mobile: "9876543210" }, headers: { "x-forwarded-for": ip } }));
    const known = await call(loginRequest.POST, req("POST", "/api/intake/login/request", { body: { displayId: p.displayId, mobile: p.mobile }, headers: { "x-forwarded-for": ip } }));
    expect(unknown.json.message).toBe(known.json.message);
    expect(known.json.devCode).toMatch(/^\d{6}$/); // console driver in development/test only
    await vi.waitFor(() => expect(messageFor("login_code", p.mobile)?.text).toContain(known.json.devCode)); // sent off the request path
    expect((await (await db()).query("select 1 from participant_otps where code_hash = $1", [known.json.devCode])).rows).toHaveLength(0); // stored hashed

    const jar: Jar = { cookies: {} };
    const wrong = known.json.devCode === "000000" ? "111111" : "000000";
    const bad = await call(loginVerify.POST, req("POST", "/api/intake/login/verify", { body: { displayId: p.displayId, mobile: p.mobile, code: wrong } }), {}, jar);
    expect(bad.status).toBe(401);
    const good = await call(loginVerify.POST, req("POST", "/api/intake/login/verify", { body: { displayId: p.displayId, mobile: p.mobile, code: known.json.devCode } }), {}, jar);
    expect(good.status).toBe(200);
    expect((await call(vcase.GET, req("GET", "/api/intake/virtual", { jar }))).json.status).toBe("awaiting_images");
    const reuse = await call(loginVerify.POST, req("POST", "/api/intake/login/verify", { body: { displayId: p.displayId, mobile: p.mobile, code: known.json.devCode } }));
    expect(reuse.status).toBe(401); // single use

    // Five wrong guesses lock the code.
    const again = await call(loginRequest.POST, req("POST", "/api/intake/login/request", { body: { displayId: p.displayId, mobile: p.mobile }, headers: { "x-forwarded-for": randomIp() } }));
    for (let i = 0; i < 5; i++) await call(loginVerify.POST, req("POST", "/api/intake/login/verify", { body: { displayId: p.displayId, mobile: p.mobile, code: again.json.devCode === "000000" ? "111111" : "000000" } }));
    expect((await call(loginVerify.POST, req("POST", "/api/intake/login/verify", { body: { displayId: p.displayId, mobile: p.mobile, code: again.json.devCode } }))).status).toBe(401);
  });
});

describe("feature switch", () => {
  it("returns 503 everywhere while virtual screening is disabled", async () => {
    const p = await registerVirtual();
    vi.stubEnv("VIRTUAL_SCREENING_ENABLED", "false");
    resetConfigForTests();
    expect((await call(vcase.GET, req("GET", "/api/intake/virtual", { jar: p.jar }))).status).toBe(503);
    expect((await call(tickets.POST, req("POST", "/api/intake/virtual/uploads", { jar: p.jar, body: { view: "lips", contentType: "image/jpeg", bytes: 10 } }))).status).toBe(503);
    expect((await call(queue.GET, req("GET", "/api/virtual/cases", { jar: c.doc }))).status).toBe(503);
  });
});

describe("updated virtual registration flow (photo guide, upload confirmation, timeline)", () => {
  const events = async (jar: Jar) => {
    const me = await call(vcase.GET, req("GET", "/api/intake/virtual", { jar }));
    return Object.fromEntries((me.json.timeline as { key: string; at: string | null }[]).map((e) => [e.key, e.at]));
  };

  it("keeps photo capture closed until the guide is watched, and records language, version and time (not consent)", async () => {
    const p = await registerVirtual({}, { guide: false });
    const before = await call(vcase.GET, req("GET", "/api/intake/virtual", { jar: p.jar }));
    expect(before.json.tutorial).toMatchObject({ completedAt: null, current: TUTORIAL_VERSION });
    const blocked = await uploadView(p.jar, "lips", await mouthPhoto());
    expect(blocked.ticket.status).toBe(409);
    expect(blocked.ticket.json.error.code).toBe("tutorial_required");

    expect((await watchGuide(p.jar, { language: "hi", version: "old" })).json.error.code).toBe("tutorial_outdated");
    expect((await watchGuide(p.jar, { language: "fr", version: TUTORIAL_VERSION })).status).toBe(422);
    const consentsBefore = (await (await db()).query("select count(*)::int as n from consents where patient_id = $1", [p.patientId])).rows[0];
    expect((await watchGuide(p.jar, { language: "hi", version: TUTORIAL_VERSION })).status).toBe(200);
    const c = (await (await db()).query("select tutorial_language, tutorial_version, tutorial_completed_at from virtual_cases where patient_id = $1", [p.patientId])).rows[0]!;
    expect(c).toMatchObject({ tutorial_language: "hi", tutorial_version: TUTORIAL_VERSION });
    expect(c.tutorial_completed_at).toBeTruthy();
    expect((await (await db()).query("select count(*)::int as n from consents where patient_id = $1", [p.patientId])).rows[0]).toEqual(consentsBefore);
    const audited = await (await db()).query("select details from audit_events where action = 'virtual_tutorial.complete' and target_ref = $1", [p.patientId]);
    expect(audited.rows[0]!.details).toMatchObject({ language: "hi", version: TUTORIAL_VERSION });
    expect((await uploadView(p.jar, "lips", await mouthPhoto())).done.status).toBe(201);
  });

  it("lets the patient skip the guide, records the skip and opens photo capture", async () => {
    const p = await registerVirtual({}, { guide: false });
    expect((await watchGuide(p.jar, { language: "te", version: TUTORIAL_VERSION, skipped: true })).status).toBe(200);
    const c = (await (await db()).query("select tutorial_skipped, tutorial_completed_at from virtual_cases where patient_id = $1", [p.patientId])).rows[0]!;
    expect(c.tutorial_skipped).toBe(true);
    expect(c.tutorial_completed_at).toBeTruthy();
    expect((await (await db()).query("select 1 from audit_events where action = 'virtual_tutorial.skip' and target_ref = $1", [p.patientId])).rows).toHaveLength(1);
    const me = await call(vcase.GET, req("GET", "/api/intake/virtual", { jar: p.jar }));
    expect(me.json.tutorial.skipped).toBe(true);
    expect(me.json.timeline.find((e: { key: string }) => e.key === "tutorial").label).toBe("Tutorial Skipped");
    expect((await uploadView(p.jar, "lips", await mouthPhoto())).done.status).toBe(201);
  });

  it("confirms the upload only when every photo is readable in storage, and never shows a failed submit as done", async () => {
    const p = await registerVirtual();
    await uploadRequired(p.jar);
    expect((await events(p.jar)).captured).toBeTruthy();
    const d = await db();
    const lost = (await d.query<{ object_key: string }>("select object_key from virtual_images where patient_id = $1 and view = 'upper_mouth'", [p.patientId])).rows[0]!;
    await objectStore("clinical").delete(lost.object_key);
    const failed = await call(submit.POST, req("POST", "/api/intake/virtual/submit", { jar: p.jar }));
    expect(failed.status).toBe(409);
    expect(failed.json.error.message).toMatch(/Upper mouth view/);
    expect((await caseOf(p.patientId)).status).toBe("awaiting_images");
    const t = await events(p.jar);
    expect(t.uploaded).toBeNull();
    expect(t.submitted).toBeNull();
    expect((await call(vcase.GET, req("GET", "/api/intake/virtual", { jar: p.jar }))).json.submittedMessage).toBeNull();
  });

  it("shows the timeline in order with the review statuses and the final patient message", async () => {
    const p = await registerVirtual();
    await uploadRequired(p.jar);
    expect((await call(submit.POST, req("POST", "/api/intake/virtual/submit", { jar: p.jar }))).status).toBe(200);
    const me = await call(vcase.GET, req("GET", "/api/intake/virtual", { jar: p.jar }));
    expect(me.json.statusLabel).toBe("Pending Review");
    expect(me.json.submittedMessage).toBe(SUBMITTED_MESSAGE);
    expect((me.json.timeline as { label: string }[]).map((e) => e.label)).toEqual([
      "Registered", "Questionnaire Completed", "Required Consents Recorded", "Tutorial Completed", "Five Photos Captured",
      "Photo Upload Completed", "Submitted for Doctor Review", "Doctor Review Started", "Doctor Review Completed",
    ]);
    const before = await events(p.jar);
    for (const k of ["registered", "questionnaire", "consents", "tutorial", "captured", "uploaded", "submitted"]) expect(before[k], k).toBeTruthy();
    expect(before.review_started).toBeNull();

    const { jar: doc } = await staffJar("admin");
    const caseId = (await caseOf(p.patientId)).id;
    const opened = await call(caseRoute.GET, req("GET", `/api/virtual/cases/${caseId}`, { jar: doc }), { id: caseId });
    expect(opened.json.case.statusLabel).toBe("In Review");
    expect(opened.json.timeline.find((e: { key: string }) => e.key === "review_started").at).toBeTruthy();
    expect(opened.json.tutorial.language).toBe("te");

    const r = await call(decision.POST, req("POST", `/api/virtual/cases/${caseId}/decision`, { jar: doc, body: { decision: "suspicious", notes: "Synthetic", nextSteps: "Clinic visit" } }), { id: caseId });
    expect(r.status).toBe(200);
    await dispatchDue();
    const after = await call(vcase.GET, req("GET", "/api/intake/virtual", { jar: p.jar }));
    expect(after.json.statusLabel).toBe("Follow-up Required");
    const labels = (after.json.timeline as { label: string; at: string | null }[]);
    expect(labels.slice(-2).map((e) => e.label)).toEqual(["Follow-up Required", "Follow-up Notification Sent"]);
    expect(labels.every((e) => e.at)).toBe(true);
  });

  it("labels an inconclusive review as Unable to Assess", async () => {
    const p = await registerVirtual();
    await uploadRequired(p.jar);
    await call(submit.POST, req("POST", "/api/intake/virtual/submit", { jar: p.jar }));
    const { jar: doc } = await staffJar("admin");
    const caseId = (await caseOf(p.patientId)).id;
    await call(caseRoute.GET, req("GET", `/api/virtual/cases/${caseId}`, { jar: doc }), { id: caseId });
    await call(decision.POST, req("POST", `/api/virtual/cases/${caseId}/decision`, { jar: doc, body: { decision: "inconclusive", inconclusiveAction: "in_person" } }), { id: caseId });
    const q = await call(queue.GET, req("GET", "/api/virtual/cases?status=reviewed", { jar: doc }));
    expect(q.json.items.find((c: { id: string }) => c.id === caseId).statusLabel).toBe("Unable to Assess");
  });
});
