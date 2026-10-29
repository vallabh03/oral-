// Regression tests for the independent security review of the lesion-image feature.
import { beforeAll, describe, expect, it, vi } from "vitest";
import sharp from "sharp";
import { db } from "@/lib/server/db";
import { objectStore } from "@/lib/server/storage";
import { stripJpeg, stripPng } from "@/lib/server/clinicalImage";
import { call, COMPLETE_ANSWERS, key, registerParticipant, req, seedCamp, staffJar, type Jar } from "../helpers";
import * as action from "@/app/api/patients/[id]/[action]/route";
import * as lesions from "@/app/api/patients/[id]/lesion-images/route";
import * as link from "@/app/api/lesion-images/[imageId]/link/route";
import * as questionnaire from "@/app/api/intake/questionnaire/route";

const photo = (seed = 1) =>
  sharp({ create: { width: 900, height: 700, channels: 3, background: { r: 200, g: 120 + seed, b: 120 }, noise: { type: "gaussian", mean: 120, sigma: 40 } } }).jpeg({ quality: 88 }).toBuffer();
const seg = (marker: number, payload: Buffer) => {
  const h = Buffer.alloc(4);
  h.writeUInt16BE(0xff00 | marker, 0);
  h.writeUInt16BE(payload.length + 2, 2);
  return Buffer.concat([h, payload]);
};

describe("metadata stripping hardening (finding 1, 7)", () => {
  it("removes metadata hidden between progressive scans and anything after EOI (e.g. secondary images with GPS)", async () => {
    const base = await sharp({ create: { width: 400, height: 300, channels: 3, background: "#a66", noise: { type: "gaussian", mean: 128, sigma: 40 } } }).jpeg({ progressive: true }).toBuffer();
    // Insert an APP1 "Exif" with a device marker after the first scan's data, and append a whole
    // second JPEG carrying its own EXIF after EOI (like MPF gain maps / vendor trailers).
    const sos2 = base.indexOf(Buffer.from([0xff, 0xc4]), base.indexOf(Buffer.from([0xff, 0xda])) + 2);
    expect(sos2).toBeGreaterThan(0);
    const hidden = seg(0xe1, Buffer.from("Exif\0\0HIDDEN-DEVICE-GPS", "latin1"));
    const second = await sharp({ create: { width: 64, height: 64, channels: 3, background: "#000" } }).jpeg().withExif({ IFD0: { Make: "TRAILER-PHONE" } }).toBuffer();
    const crafted = Buffer.concat([base.subarray(0, sos2), hidden, base.subarray(sos2), second]);
    const out = stripJpeg(crafted);
    expect(out.data.includes(Buffer.from("HIDDEN-DEVICE-GPS"))).toBe(false);
    expect(out.data.includes(Buffer.from("TRAILER-PHONE"))).toBe(false);
    expect(out.removed).toEqual(expect.arrayContaining(["exif", "trailing_data"]));
    expect((await sharp(out.data).raw().toBuffer()).equals(await sharp(base).raw().toBuffer())).toBe(true);
  });

  it("drops JFXX thumbnails, COM segments and unknown PNG chunks (allow-list)", async () => {
    const base = await sharp({ create: { width: 300, height: 300, channels: 3, background: "#777" } }).jpeg().toBuffer();
    const jfxx = seg(0xe0, Buffer.from("JFXX\0THUMBNAIL-DATA", "latin1"));
    const com = seg(0xfe, Buffer.from("taken by phone serial 999", "latin1"));
    const out = stripJpeg(Buffer.concat([base.subarray(0, 2), jfxx, com, base.subarray(2)]));
    expect(out.data.includes(Buffer.from("THUMBNAIL-DATA"))).toBe(false);
    expect(out.data.includes(Buffer.from("serial 999"))).toBe(false);

    const png = await sharp({ create: { width: 300, height: 300, channels: 3, background: "#777" } }).png().toBuffer();
    const chunk = Buffer.concat([Buffer.from([0, 0, 0, 12]), Buffer.from("caBXC2PA-DEVICE!", "latin1"), Buffer.alloc(4)]);
    const withC2pa = Buffer.concat([png.subarray(0, png.length - 12), chunk, png.subarray(png.length - 12)]);
    const p = stripPng(withC2pa);
    expect(p.data.includes(Buffer.from("C2PA-DEVICE"))).toBe(false);
    expect(p.removed).toContain("caBX");
  });

  it("rejects truncated JPEGs with no end marker", async () => {
    const base = await photo();
    expect(() => stripJpeg(base.subarray(0, base.length - 2))).toThrow();
  });
});

type Ctx = { camp: string; doc: Jar };
const c = {} as Ctx;
const act = (id: string, name: string, body: unknown) => call(action.POST, req("POST", `/api/patients/${id}/${name}`, { body, jar: c.doc }), { id, action: name });
const upload = (pid: string, q: Record<string, string>, raw: Buffer, k = key()) =>
  call(lesions.POST, req("POST", `/api/patients/${pid}/lesion-images?${new URLSearchParams(q)}`, { jar: c.doc, raw, contentType: "image/jpeg", headers: { "idempotency-key": k } }), { id: pid });
const list = (pid: string) => call(lesions.GET, req("GET", `/api/patients/${pid}/lesion-images`, { jar: c.doc }), { id: pid });

async function lesionPatient() {
  const p = await registerParticipant({ campId: c.camp });
  await call(questionnaire.POST, req("POST", "/api/intake/questionnaire", { jar: p.jar, body: { answers: COMPLETE_ANSWERS, complete: true, idempotencyKey: key() } }));
  const exam = await act(p.patientId, "exam", { examCompleted: "yes", mouthOpening: "normal", oralFindings: ["ulcer"], lesionSites: ["tongue", "lip"], lesionPresent: "yes", clinicalImpression: "pmod" });
  return { pid: p.patientId, examId: exam.json.examId as string };
}

beforeAll(async () => {
  c.camp = await seedCamp("HARD-01", "Hardening camp", "Area H");
  c.doc = (await staffJar("admin")).jar;
});

describe("consent semantics (findings 4, 5)", () => {
  it("withdrawing face consent hides images that include the face", async () => {
    const { pid, examId } = await lesionPatient();
    await act(pid, "clinical-photo-consent", { decision: "granted", faceDecision: "granted" });
    const face = (await upload(pid, { examId, lesionSite: "lip", includesFace: "true" }, await photo(1))).json.id;
    const noFace = (await upload(pid, { examId, lesionSite: "tongue" }, await photo(2))).json.id;
    await act(pid, "withdraw-consent", { consentType: "clinical_photo_face" });
    const l = await list(pid);
    expect(l.json.images.map((i: { id: string }) => i.id)).toEqual([noFace]);
    expect(l.json.hiddenAfterWithdrawal).toBe(1);
    expect((await call(link.POST, req("POST", `/api/lesion-images/${face}/link`, { jar: c.doc, body: { variant: "view" } }), { imageId: face })).status).toBe(409);
  });

  it("a later re-grant does not revive images hidden by an earlier withdrawal", async () => {
    const { pid, examId } = await lesionPatient();
    await act(pid, "clinical-photo-consent", { decision: "granted" });
    const old = (await upload(pid, { examId, lesionSite: "tongue" }, await photo(3))).json.id;
    await act(pid, "withdraw-consent", { consentType: "clinical_photo" });
    await act(pid, "clinical-photo-consent", { decision: "granted" }); // doctor records a new grant
    const fresh = (await upload(pid, { examId, lesionSite: "tongue" }, await photo(4))).json.id;
    const l = await list(pid);
    expect(l.json.images.map((i: { id: string }) => i.id)).toEqual([fresh]);
    expect((await call(link.POST, req("POST", `/api/lesion-images/${old}/link`, { jar: c.doc, body: { variant: "view" } }), { imageId: old })).status).toBe(409);
  });
});

describe("race conditions (findings 3, 9) and validation (finding 12)", () => {
  it("re-checks the workflow inside the transaction: an exam verified mid-upload rejects the image", async () => {
    const { pid, examId } = await lesionPatient();
    await act(pid, "clinical-photo-consent", { decision: "granted" });
    // One image is already on the exam (verification requires it); the second races verification.
    expect((await upload(pid, { examId, lesionSite: "tongue" }, await photo(4))).status).toBe(201);
    const store = objectStore("clinical");
    const original = store.put.bind(store);
    let verified = false;
    const spy = vi.spyOn(store, "put").mockImplementation(async (k, data, type) => {
      if (!verified) {
        verified = true;
        await act(pid, "verify", { examId }); // concurrent verification while bytes are being stored
      }
      return original(k, data, type);
    });
    const r = await upload(pid, { examId, lesionSite: "tongue" }, await photo(5));
    spy.mockRestore();
    expect(r.status).toBe(409);
    const d = await db();
    expect((await d.query("select 1 from lesion_images where patient_id = $1", [pid])).rows).toHaveLength(1);
    // Only the first image's stored files remain: the rejected upload left nothing behind.
    expect((await d.query("select 1 from blob_objects where key like $1", [`lesions/${pid}/%`])).rows).toHaveLength(2);
  });

  it("concurrent uploads with the same idempotency key produce one image, not an error", async () => {
    const { pid, examId } = await lesionPatient();
    await act(pid, "clinical-photo-consent", { decision: "granted" });
    const k = key();
    const img = await photo(6);
    const [a, b] = await Promise.all([upload(pid, { examId, lesionSite: "tongue" }, img, k), upload(pid, { examId, lesionSite: "tongue" }, img, k)]);
    expect([a.status, b.status].sort()).toEqual([200, 201]);
    expect(a.json.id).toBe(b.json.id);
  });

  it("rejects a lesion site that is not recorded in the examination", async () => {
    const { pid, examId } = await lesionPatient();
    await act(pid, "clinical-photo-consent", { decision: "granted" });
    expect((await upload(pid, { examId, lesionSite: "palate" }, await photo(7))).status).toBe(422);
  });
});
