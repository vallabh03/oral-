import { describe, expect, it } from "vitest";
import sharp from "sharp";
import { extractUtm, sanitizeTrackedPath, sanitizeUtmValue } from "@/lib/shared/analytics";
import { Semaphore, SemaphoreFullError } from "@/lib/server/semaphore";
import { processPhoto, sniffImageType } from "@/lib/server/images";
import { splitSql } from "@/lib/server/db";
import { can, inCampScope, PERMISSIONS } from "@/lib/server/authz";
import { contactSchema, examSchema, registrationSchema } from "@/lib/server/schemas";
import { registration } from "../helpers";

describe("analytics privacy", () => {
  it("sanitises UTM values", () => {
    expect(sanitizeUtmValue("Spring<script>Sale")).toBe("springscriptsale");
    expect(sanitizeUtmValue("a".repeat(100))).toHaveLength(64);
    expect(extractUtm("?utm_source=Poster&utm_medium=QR&utm_campaign=drive%20safe&name=Ravi")).toEqual({ utm_source: "poster", utm_medium: "qr", utm_campaign: "drivesafe" });
  });
  it("never tracks private or parameterised paths", () => {
    expect(sanitizeTrackedPath("/workspace/patients/123")).toBeNull();
    expect(sanitizeTrackedPath("/api/events")).toBeNull();
    expect(sanitizeTrackedPath("/register/status")).toBeNull();
    expect(sanitizeTrackedPath("/camps?mobile=9876543210")).toBe("/camps");
    expect(sanitizeTrackedPath("/faq")).toBe("/faq");
  });
});

describe("semaphore backpressure", () => {
  it("bounds concurrency and rejects when the queue is full", async () => {
    const s = new Semaphore(2, 2);
    let active = 0;
    let peak = 0;
    const task = () => s.run(async () => {
      active++;
      peak = Math.max(peak, active);
      await new Promise((r) => setTimeout(r, 20));
      active--;
    });
    const results = await Promise.allSettled(Array.from({ length: 6 }, task));
    expect(peak).toBe(2);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(4);
    expect(results.filter((r) => r.status === "rejected" && r.reason instanceof SemaphoreFullError)).toHaveLength(2);
  });
});

describe("photo processing", () => {
  it("detects real image types from magic bytes", async () => {
    const jpg = await sharp({ create: { width: 100, height: 100, channels: 3, background: "#888" } }).jpeg().toBuffer();
    expect(sniffImageType(jpg)).toBe("jpeg");
    expect(sniffImageType(Buffer.from("<svg xmlns='http://www.w3.org/2000/svg'></svg>"))).toBeNull();
    expect(sniffImageType(Buffer.from("GIF89a........"))).toBeNull();
  });
  it("downsizes, re-encodes to WebP and strips EXIF/GPS metadata", async () => {
    const big = await sharp({ create: { width: 3000, height: 4000, channels: 3, background: "#c96" } })
      .withMetadata({ exif: { IFD0: { Copyright: "secret-gps-owner" } } })
      .jpeg()
      .toBuffer();
    expect(big.includes(Buffer.from("secret-gps-owner"))).toBe(true);
    const out = await processPhoto(big);
    const meta = await sharp(out.full).metadata();
    expect(meta.format).toBe("webp");
    expect(Math.max(meta.width!, meta.height!)).toBeLessThanOrEqual(720);
    expect(meta.exif).toBeUndefined();
    expect(out.full.includes(Buffer.from("secret-gps-owner"))).toBe(false);
    expect(out.thumb.length).toBeLessThan(out.full.length);
    expect((await sharp(out.thumb).metadata()).width).toBe(160);
  });
  it("rejects polyglot/non-image uploads", async () => {
    await expect(processPhoto(Buffer.from("not an image at all, just text pretending"))).rejects.toMatchObject({ status: 415 });
  });
});

describe("migration splitter", () => {
  it("keeps $$ function bodies intact", () => {
    const parts = splitSql("create table a (x int);\ncreate function f() returns trigger language plpgsql as $$\nbegin\n  return new;\nend $$;\nselect 1;");
    expect(parts).toHaveLength(3);
    expect(parts[1]).toContain("return new;");
  });
});

describe("permission matrix (regression snapshot)", () => {
  it("matches the approved PRD §3.3 matrix", () => {
    expect(PERMISSIONS).toMatchSnapshot();
  });
  it("keeps clinical actions away from Super Admin and Assistant", () => {
    for (const p of ["exam.write", "exam.verify", "report.generate", "whatsapp.send", "clinical_image.capture", "clinical_image.view", "clinical_image.delete", "virtual.review"] as const) {
      expect(can("super_admin", p)).toBe(false);
      expect(can("assistant", p)).toBe(false);
      expect(can("admin", p)).toBe(true);
    }
    expect(can("admin", "users.manage")).toBe(false);
    expect(can("assistant", "patient.read")).toBe(false);
  });
  it("enforces camp scope", () => {
    expect(inCampScope(null, "x")).toBe(true);
    expect(inCampScope(["a"], "a")).toBe(true);
    expect(inCampScope(["a"], "b")).toBe(false);
    expect(inCampScope(["a"], null)).toBe(false);
  });
});

describe("request schemas", () => {
  it("rejects unexpected fields (mass assignment) and markup in names", () => {
    expect(registrationSchema.safeParse({ ...registration(), role: "super_admin" }).success).toBe(false);
    expect(registrationSchema.safeParse(registration({ fullName: "<img src=x onerror=alert(1)>" })).success).toBe(false);
    expect(registrationSchema.safeParse(registration({ fullName: "రవి కుమార్" })).success).toBe(true);
  });
  it("requires consents and validates Indian mobiles", () => {
    expect(registrationSchema.safeParse(registration({ consents: { registration: false, screening: true, followupContact: false, whatsappReport: false, photo: false } })).success).toBe(false);
    expect(registrationSchema.safeParse(registration({ mobile: "12345" })).success).toBe(false);
    expect(registrationSchema.safeParse(registration({ mobile: "", contactPreference: "none", consents: { registration: true, screening: true, followupContact: false, whatsappReport: false, photo: false } })).success).toBe(true);
    expect(registrationSchema.safeParse(registration({ mobile: "", consents: { registration: true, screening: true, followupContact: false, whatsappReport: true, photo: false } })).success).toBe(false);
  });
  it("blocks the honeypot", () => {
    expect(contactSchema.safeParse({ name: "A B", email: "a@b.co", topic: "general", message: "hello there!", idempotencyKey: "k".repeat(20), website: "spam" }).success).toBe(false);
  });
  it("flags inconsistent examinations", () => {
    expect(examSchema.safeParse({ examCompleted: "yes", mouthOpening: "normal", oralFindings: ["ulcer"], lesionSites: ["tongue"], lesionPresent: "no", clinicalImpression: "benign" }).success).toBe(false);
    expect(examSchema.safeParse({ examCompleted: "yes", mouthOpening: "normal", oralFindings: ["no_abnormality", "ulcer"], lesionSites: [], lesionPresent: "yes", clinicalImpression: "benign" }).success).toBe(false);
    expect(examSchema.safeParse({ examCompleted: "unable_or_refused", oralFindings: [], lesionSites: [] }).success).toBe(true);
  });
});
