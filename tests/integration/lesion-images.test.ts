// PRD v1.2 — oral lesion image capture: consent, upload, validation, access control,
// short-lived links, audit and failure handling. Synthetic images only.
import { beforeAll, describe, expect, it, vi } from "vitest";
import sharp from "sharp";
import { db } from "@/lib/server/db";
import { objectStore } from "@/lib/server/storage";
import { hashToken } from "@/lib/server/security/crypto";
import { signLesionLink } from "@/lib/server/services/lesionImages";
import { resetConfigForTests } from "@/lib/server/config";
import { call, COMPLETE_ANSWERS, key, registerParticipant, req, seedCamp, staffJar, type Jar } from "../helpers";
import * as action from "@/app/api/patients/[id]/[action]/route";
import * as lesions from "@/app/api/patients/[id]/lesion-images/route";
import * as link from "@/app/api/lesion-images/[imageId]/link/route";
import * as content from "@/app/api/lesion-images/[imageId]/content/route";
import * as del from "@/app/api/lesion-images/[imageId]/route";
import * as questionnaire from "@/app/api/intake/questionnaire/route";

const lesionPhoto = (w = 1200, h = 900) =>
  sharp({ create: { width: w, height: h, channels: 3, background: "#d99", noise: { type: "gaussian", mean: 120, sigma: 45 } } })
    .jpeg({ quality: 90 })
    .withExif({ IFD0: { Make: "SyntheticPhoneCo" }, IFD3: { GPSLatitudeRef: "N", GPSLatitude: "17/1 23/1 0/1" } })
    .toBuffer();

const act = (jar: Jar, id: string, name: string, body: unknown) => call(action.POST, req("POST", `/api/patients/${id}/${name}`, { body, jar }), { id, action: name });
const upload = (jar: Jar, pid: string, q: Record<string, string>, raw: Buffer, opts: { contentType?: string; key?: string } = {}) =>
  call(lesions.POST, req("POST", `/api/patients/${pid}/lesion-images?${new URLSearchParams(q)}`, { jar, raw, contentType: opts.contentType ?? "image/jpeg", headers: { "idempotency-key": opts.key ?? key() } }), { id: pid });
const getLink = (jar: Jar, imageId: string, variant = "view") => call(link.POST, req("POST", `/api/lesion-images/${imageId}/link`, { jar, body: { variant } }), { imageId });
const fetchContent = (jar: Jar, url: string, imageId: string) => call(content.GET, req("GET", url, { jar }), { imageId });

type Ctx = { campA: string; campB: string; doc: Jar; docToken: string; scoped: Jar; superAdmin: Jar; assistant: Jar };
const c = {} as Ctx;

/** Participant with a completed questionnaire and a draft exam that records a lesion. */
async function patientWithLesionExam(campId: string) {
  const p = await registerParticipant({ campId });
  await call(questionnaire.POST, req("POST", "/api/intake/questionnaire", { jar: p.jar, body: { answers: COMPLETE_ANSWERS, complete: true, idempotencyKey: key() } }));
  const exam = await act(c.doc, p.patientId, "exam", { examCompleted: "yes", mouthOpening: "normal", oralFindings: ["leukoplakia"], lesionSites: ["left_buccal", "tongue", "lip", "palate"], lesionPresent: "yes", clinicalImpression: "pmod" });
  return { ...p, examId: exam.json.examId as string };
}

beforeAll(async () => {
  c.campA = await seedCamp("LES-A", "Lesion camp A", "Area A");
  c.campB = await seedCamp("LES-B", "Lesion camp B", "Area B");
  const d = await staffJar("admin");
  c.doc = d.jar;
  c.docToken = Object.values(d.jar.cookies)[0]!;
  c.scoped = (await staffJar("admin", { campScope: [c.campB] })).jar;
  c.superAdmin = (await staffJar("super_admin")).jar;
  c.assistant = (await staffJar("assistant")).jar;
});

describe("consent granted → image uploaded, stored privately, viewable by an authorised clinician", () => {
  it("captures, strips GPS/device metadata losslessly, serves via a short-lived link and audits everything", async () => {
    const p = await patientWithLesionExam(c.campA);
    const consent = await act(c.doc, p.patientId, "clinical-photo-consent", { decision: "granted", faceDecision: "declined" });
    expect(consent.json).toEqual({ photo: "granted", face: "declined" });

    const src = await lesionPhoto();
    const up = await upload(c.doc, p.patientId, { examId: p.examId, lesionSite: "left_buccal" }, src);
    expect(up.status).toBe(201);
    expect(up.json.metadataRemoved).toContain("exif");

    const list = await call(lesions.GET, req("GET", `/api/patients/${p.patientId}/lesion-images`, { jar: c.doc }), { id: p.patientId });
    expect(list.json.status.photo).toBe("granted");
    expect(list.json.images).toHaveLength(1);
    expect(list.json.images[0]).toMatchObject({ lesionSite: "left_buccal", includesFace: false, mime: "image/jpeg", examVersion: 1 });
    expect(JSON.stringify(list.json)).not.toMatch(/lesions\//); // no storage keys or URLs in listings

    // Stored under a random key, linked to participant/exam/site/clinician/time.
    const d = await db();
    const row = (await d.query<{ object_key: string; exam_record_id: string; captured_by: string; consent_id: string }>("select object_key, exam_record_id, captured_by, consent_id from lesion_images where id = $1", [up.json.id])).rows[0]!;
    expect(row.object_key).toMatch(new RegExp(`^lesions/${p.patientId}/[0-9a-f-]{36}\\.jpg$`));
    expect(row.object_key).not.toMatch(/driver|test/i);
    expect(row.exam_record_id).toBe(p.examId);

    const l = await getLink(c.doc, up.json.id);
    expect(l.status).toBe(200);
    expect(l.json.url).toMatch(/^\/api\/lesion-images\/[0-9a-f-]{36}\/content\?v=view&e=\d+&s=[0-9a-f]{40}$/);
    expect(Date.parse(l.json.expiresAt) - Date.now()).toBeLessThanOrEqual(300_000);
    const img = await call(content.GET, req("GET", l.json.url, { jar: c.doc }), { imageId: up.json.id });
    expect(img.status).toBe(200);
    expect(img.headers.get("content-type")).toBe("image/jpeg");
    expect(img.headers.get("cache-control")).toContain("no-store");
    const served = Buffer.from(await (await content.GET(req("GET", l.json.url, { jar: c.doc }), { params: Promise.resolve({ imageId: up.json.id }) })).arrayBuffer());
    expect(served.includes(Buffer.from("SyntheticPhoneCo"))).toBe(false); // device/GPS metadata removed
    const rawA = await sharp(served).raw().toBuffer();
    const rawB = await sharp(src).raw().toBuffer();
    expect(rawA.equals(rawB)).toBe(true); // clinical pixels unchanged

    const dl = await getLink(c.doc, up.json.id, "download");
    const file = await fetchContent(c.doc, dl.json.url, up.json.id);
    expect(file.headers.get("content-disposition")).toMatch(/^attachment; filename="lesion-left_buccal-\d{4}-\d{2}-\d{2}\.jpg"$/);

    const events = (await d.query<{ action: string; details: Record<string, unknown> }>(
      "select action, details from audit_events where target_ref = $1 and action like 'lesion_image.%' or (target_ref = $1 and action like 'consent.clinical%') order by seq", [p.patientId])).rows;
    const actions = events.map((e) => e.action);
    expect(actions).toEqual(expect.arrayContaining(["consent.clinical_photo", "consent.clinical_photo_face", "lesion_image.capture", "lesion_image.view", "lesion_image.download"]));
    // Audit details never contain image data, keys or URLs.
    expect(JSON.stringify(events)).not.toMatch(/lesions\/|content\?|base64|&s=/);
  });

  it("is idempotent across retries and supports replacement while the exam is a draft", async () => {
    const p = await patientWithLesionExam(c.campA);
    await act(c.doc, p.patientId, "clinical-photo-consent", { decision: "granted" });
    const k = key();
    const img = await lesionPhoto(800, 600);
    const a = await upload(c.doc, p.patientId, { examId: p.examId, lesionSite: "left_buccal" }, img, { key: k });
    const b = await upload(c.doc, p.patientId, { examId: p.examId, lesionSite: "left_buccal" }, img, { key: k });
    expect(a.status).toBe(201);
    expect(b.status).toBe(200);
    expect(b.json.id).toBe(a.json.id);
    const r = await upload(c.doc, p.patientId, { examId: p.examId, lesionSite: "tongue", replacesId: a.json.id }, await lesionPhoto(900, 700));
    expect(r.status).toBe(201);
    const list = await call(lesions.GET, req("GET", `/api/patients/${p.patientId}/lesion-images`, { jar: c.doc }), { id: p.patientId });
    expect(list.json.images.map((i: { id: string }) => i.id)).toEqual([r.json.id]);
    expect((await getLink(c.doc, a.json.id)).status).toBe(404); // replaced image no longer accessible
  });

  it("requires separate face consent for images that include the face", async () => {
    const p = await patientWithLesionExam(c.campA);
    await act(c.doc, p.patientId, "clinical-photo-consent", { decision: "granted", faceDecision: "declined" });
    expect((await upload(c.doc, p.patientId, { examId: p.examId, lesionSite: "lip", includesFace: "true" }, await lesionPhoto())).status).toBe(409);
    await act(c.doc, p.patientId, "clinical-photo-consent", { decision: "granted", faceDecision: "granted" });
    expect((await upload(c.doc, p.patientId, { examId: p.examId, lesionSite: "lip", includesFace: "true" }, await lesionPhoto())).status).toBe(201);
  });
});

describe("consent declined → examination completes without images", () => {
  it("blocks capture but never blocks verification, classification or reporting", async () => {
    const p = await patientWithLesionExam(c.campA);
    const consent = await act(c.doc, p.patientId, "clinical-photo-consent", { decision: "declined" });
    expect(consent.json.photo).toBe("declined");
    const up = await upload(c.doc, p.patientId, { examId: p.examId, lesionSite: "left_buccal" }, await lesionPhoto());
    expect(up.status).toBe(409);
    const v = await act(c.doc, p.patientId, "verify", { examId: p.examId });
    expect(v.json.classification.group).toBe(4);
    expect((await act(c.doc, p.patientId, "report", {})).status).toBe(201);
  });

  it("requires photography consent to be asked, and an image when granted, before a lesion exam is verified", async () => {
    const p = await patientWithLesionExam(c.campA);
    const list = await call(lesions.GET, req("GET", `/api/patients/${p.patientId}/lesion-images`, { jar: c.doc }), { id: p.patientId });
    expect(list.json.status.photo).toBe("not_recorded");
    const notAsked = await act(c.doc, p.patientId, "verify", { examId: p.examId });
    expect(notAsked.status).toBe(409);
    expect(notAsked.json.error.message).toMatch(/photography consent/);
    await act(c.doc, p.patientId, "clinical-photo-consent", { decision: "granted", faceDecision: "declined" });
    expect((await act(c.doc, p.patientId, "verify", { examId: p.examId })).json.error.message).toMatch(/at least one lesion image/);
    expect((await upload(c.doc, p.patientId, { examId: p.examId, lesionSite: "tongue" }, await lesionPhoto())).status).toBe(201);
    expect((await act(c.doc, p.patientId, "verify", { examId: p.examId })).json.verified).toBe(true);
  });

  it("reports 'not applicable' when no lesion is recorded and refuses images", async () => {
    const p = await registerParticipant({ campId: c.campA });
    const exam = await act(c.doc, p.patientId, "exam", { examCompleted: "yes", mouthOpening: "normal", oralFindings: ["no_abnormality"], lesionSites: [], lesionPresent: "no", clinicalImpression: "normal" });
    const list = await call(lesions.GET, req("GET", `/api/patients/${p.patientId}/lesion-images`, { jar: c.doc }), { id: p.patientId });
    expect(list.json.status.photo).toBe("not_applicable");
    await act(c.doc, p.patientId, "clinical-photo-consent", { decision: "granted" });
    expect((await upload(c.doc, p.patientId, { examId: exam.json.examId, lesionSite: "tongue" }, await lesionPhoto())).status).toBe(409);
  });
});

describe("invalid, malformed or oversized images are rejected", () => {
  it("validates type, real content, integrity and size on the server", async () => {
    const p = await patientWithLesionExam(c.campA);
    await act(c.doc, p.patientId, "clinical-photo-consent", { decision: "granted" });
    const q = { examId: p.examId, lesionSite: "left_buccal" };
    const good = await lesionPhoto();
    expect((await upload(c.doc, p.patientId, q, Buffer.from("<svg onload=alert(1)>"), { contentType: "image/svg+xml" })).status).toBe(415);
    expect((await upload(c.doc, p.patientId, q, Buffer.from("GIF89a.........."), { contentType: "image/jpeg" })).status).toBe(415); // content ≠ declared type
    expect((await upload(c.doc, p.patientId, q, good.subarray(0, Math.floor(good.length * 0.6)))).status).toBe(415); // truncated
    expect((await upload(c.doc, p.patientId, q, Buffer.concat([good.subarray(0, 4), Buffer.alloc(5000, 0x41)]))).status).toBe(415); // malformed
    expect((await upload(c.doc, p.patientId, q, Buffer.alloc(16 * 1024 * 1024, 1))).status).toBe(413); // over the 15 MB limit
    expect((await upload(c.doc, p.patientId, q, await sharp({ create: { width: 80, height: 80, channels: 3, background: "#000" } }).jpeg().toBuffer())).status).toBe(400);
    expect((await upload(c.doc, p.patientId, { ...q, lesionSite: "../../etc" }, good)).status).toBe(422);
    const d = await db();
    expect((await d.query("select 1 from lesion_images where patient_id = $1", [p.patientId])).rows).toHaveLength(0);
  });
});

describe("access control", () => {
  let imageId = "";
  let pid = "";
  let url = "";
  beforeAll(async () => {
    const p = await patientWithLesionExam(c.campA);
    pid = p.patientId;
    await act(c.doc, pid, "clinical-photo-consent", { decision: "granted" });
    imageId = (await upload(c.doc, pid, { examId: p.examId, lesionSite: "left_buccal" }, await lesionPhoto())).json.id;
    url = (await getLink(c.doc, imageId)).json.url;
  });

  it("denies Assistant, Super Admin, participants and anonymous callers", async () => {
    for (const jar of [c.assistant, c.superAdmin]) {
      expect((await call(lesions.GET, req("GET", `/api/patients/${pid}/lesion-images`, { jar }), { id: pid })).status).toBe(403);
      expect((await getLink(jar, imageId)).status).toBe(403);
      expect((await upload(jar, pid, { examId: crypto.randomUUID(), lesionSite: "tongue" }, await lesionPhoto())).status).toBe(403);
      expect((await call(del.DELETE, req("DELETE", `/api/lesion-images/${imageId}`, { jar, body: { reason: "test" } }), { imageId })).status).toBe(403);
      expect((await fetchContent(jar, url, imageId)).status).toBe(403); // a doctor's link is useless to them
    }
    const participant = await registerParticipant({ campId: c.campA });
    expect((await call(lesions.GET, req("GET", `/api/patients/${pid}/lesion-images`, { jar: participant.jar }), { id: pid })).status).toBe(401);
    expect((await fetchContent(participant.jar, url, imageId)).status).toBe(403);
    expect((await fetchContent({ cookies: {} }, url, imageId)).status).toBe(403);
  });

  it("rejects cross-patient access by changing IDs, URLs or parameters", async () => {
    expect((await getLink(c.scoped, imageId)).status).toBe(404); // doctor outside the camp scope
    expect((await call(lesions.GET, req("GET", `/api/patients/${pid}/lesion-images`, { jar: c.scoped }), { id: pid })).status).toBe(404);
    // Another patient's exam id under this patient's URL
    const other = await patientWithLesionExam(c.campA);
    await act(c.doc, other.patientId, "clinical-photo-consent", { decision: "granted" });
    expect((await upload(c.doc, pid, { examId: other.examId, lesionSite: "tongue" }, await lesionPhoto())).status).toBe(409);
    // Replace another patient's image via replacesId
    const otherImg = (await upload(c.doc, other.patientId, { examId: other.examId, lesionSite: "tongue" }, await lesionPhoto())).json.id;
    const ownExam = (await db()).query<{ id: string }>("select id from exam_records where patient_id = $1 order by version desc limit 1", [pid]);
    expect((await upload(c.doc, pid, { examId: (await ownExam).rows[0]!.id, lesionSite: "tongue", replacesId: otherImg }, await lesionPhoto())).status).toBe(404);
    // Swap the image id inside a valid signed link
    const swapped = url.replace(imageId, otherImg);
    expect((await fetchContent(c.doc, swapped, otherImg)).status).toBe(403);
    // Reuse an idempotency key from another patient's upload
    const k = key();
    await upload(c.doc, other.patientId, { examId: other.examId, lesionSite: "tongue" }, await lesionPhoto(), { key: k });
    expect((await upload(c.doc, pid, { examId: (await ownExam).rows[0]!.id, lesionSite: "tongue" }, await lesionPhoto(), { key: k })).status).toBe(409);
  });

  it("rejects expired and tampered links", async () => {
    const expired = signLesionLink(imageId, "view", hashToken(c.docToken), Date.now() - 301_000).url;
    const r = await fetchContent(c.doc, expired, imageId);
    expect(r.status).toBe(403);
    expect(r.json.error.code).toBe("link_expired");
    const tampered = url.replace(/s=[0-9a-f]{40}/, "s=" + "0".repeat(40));
    expect((await fetchContent(c.doc, tampered, imageId)).json.error.code).toBe("invalid_link");
    const upgraded = url.replace("v=view", "v=download"); // variant is part of the signature
    expect((await fetchContent(c.doc, upgraded, imageId)).status).toBe(403);
  });

  it("stops viewing once photography consent is withdrawn", async () => {
    const p = await patientWithLesionExam(c.campA);
    await act(c.doc, p.patientId, "clinical-photo-consent", { decision: "granted" });
    const id = (await upload(c.doc, p.patientId, { examId: p.examId, lesionSite: "palate" }, await lesionPhoto())).json.id;
    const u = (await getLink(c.doc, id)).json.url;
    await act(c.doc, p.patientId, "withdraw-consent", { consentType: "clinical_photo" });
    expect((await getLink(c.doc, id)).status).toBe(409);
    expect((await fetchContent(c.doc, u, id)).status).toBe(409);
    const list = await call(lesions.GET, req("GET", `/api/patients/${p.patientId}/lesion-images`, { jar: c.doc }), { id: p.patientId });
    expect(list.json).toMatchObject({ images: [], hiddenAfterWithdrawal: 1, status: { photo: "withdrawn" } });
  });
});

describe("deletion and immutability", () => {
  it("allows audited deletion on draft exams only", async () => {
    const p = await patientWithLesionExam(c.campA);
    await act(c.doc, p.patientId, "clinical-photo-consent", { decision: "granted" });
    const a = (await upload(c.doc, p.patientId, { examId: p.examId, lesionSite: "tongue" }, await lesionPhoto())).json.id;
    const b = (await upload(c.doc, p.patientId, { examId: p.examId, lesionSite: "tongue" }, await lesionPhoto(1000, 800))).json.id;
    const d1 = await call(del.DELETE, req("DELETE", `/api/lesion-images/${a}`, { jar: c.doc, body: { reason: "Blurred image" } }), { imageId: a });
    expect(d1.status).toBe(200);
    const d = await db();
    const row = (await d.query<{ object_key: string; delete_reason: string }>("select object_key, delete_reason from lesion_images where id = $1", [a])).rows[0]!;
    expect(row.delete_reason).toBe("Blurred image");
    expect(await objectStore("clinical").get(row.object_key)).toBeNull(); // bytes removed
    await act(c.doc, p.patientId, "verify", { examId: p.examId });
    expect((await call(del.DELETE, req("DELETE", `/api/lesion-images/${b}`, { jar: c.doc, body: { reason: "Too late" } }), { imageId: b })).status).toBe(409);
    expect((await upload(c.doc, p.patientId, { examId: p.examId, lesionSite: "tongue" }, await lesionPhoto())).status).toBe(409); // verified exam is locked
  });
});

describe("failure handling", () => {
  it("handles storage failures safely: clear error, nothing half-saved", async () => {
    const p = await patientWithLesionExam(c.campA);
    await act(c.doc, p.patientId, "clinical-photo-consent", { decision: "granted" });
    const store = objectStore("clinical");
    const spy = vi.spyOn(store, "put").mockRejectedValueOnce(new Error("S3 unavailable"));
    const r = await upload(c.doc, p.patientId, { examId: p.examId, lesionSite: "tongue" }, await lesionPhoto());
    spy.mockRestore();
    expect(r.status).toBe(503);
    expect(r.json.error.code).toBe("storage_unavailable");
    expect(r.text).not.toMatch(/S3 unavailable|stack/);
    const d = await db();
    expect((await d.query("select 1 from lesion_images where patient_id = $1", [p.patientId])).rows).toHaveLength(0);
    expect((await d.query("select 1 from blob_objects where key like $1", [`lesions/${p.patientId}/%`])).rows).toHaveLength(0);
    expect((await d.query("select 1 from audit_events where target_ref = $1 and action = 'lesion_image.capture' and outcome = 'failure'", [p.patientId])).rows).toHaveLength(1);
  });

  it("stays disabled unless explicitly enabled (default for live data)", async () => {
    process.env.CLINICAL_IMAGES_ENABLED = "false";
    resetConfigForTests();
    try {
      const p = await patientWithLesionExam(c.campA);
      const r = await act(c.doc, p.patientId, "clinical-photo-consent", { decision: "granted" });
      expect(r.status).toBe(503);
      expect(r.json.error.code).toBe("feature_disabled");
    } finally {
      process.env.CLINICAL_IMAGES_ENABLED = "true";
      resetConfigForTests();
    }
  });
});
