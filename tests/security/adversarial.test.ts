// Checklist §27 "Final pre-launch security test" as automated regression: anonymous, participant,
// different participant, assistant, admin (scoped and unscoped), super admin, deactivated user
// and an unauthenticated attacker — calling APIs directly, changing IDs and tampering with input.
import { beforeAll, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { db } from "@/lib/server/db";
import { call, COMPLETE_ANSWERS, key, randomIp, registerParticipant, registration, req, seedCamp, staffJar, syntheticPortrait, type Jar } from "../helpers";
import { proxy } from "@/proxy";
import nextConfig from "../../next.config";
import * as patients from "@/app/api/patients/route";
import * as patient from "@/app/api/patients/[id]/route";
import * as action from "@/app/api/patients/[id]/[action]/route";
import * as photos from "@/app/api/photos/[id]/route";
import * as reports from "@/app/api/reports/[id]/route";
import * as users from "@/app/api/admin/users/route";
import * as camps from "@/app/api/admin/camps/route";
import * as auditApi from "@/app/api/admin/audit/route";
import * as analytics from "@/app/api/analytics/route";
import * as exportsApi from "@/app/api/exports/deidentified/route";
import * as intakePhoto from "@/app/api/intake/photo/route";
import * as questionnaire from "@/app/api/intake/questionnaire/route";
import * as register from "@/app/api/intake/register/route";
import * as session from "@/app/api/intake/session/route";
import * as login from "@/app/api/auth/login/route";
import * as webhook from "@/app/api/webhooks/whatsapp/route";

type Ctx = { anon: Jar; assistant: Jar; admin: Jar; scoped: Jar; superAdmin: Jar; deactivated: Jar; pA: Awaited<ReturnType<typeof registerParticipant>>; pB: Awaited<ReturnType<typeof registerParticipant>>; photoA: string; reportA: string; campA: string; campB: string };
const c = {} as Ctx;

beforeAll(async () => {
  c.campA = await seedCamp("SEC-A", "Security camp A", "Area A");
  c.campB = await seedCamp("SEC-B", "Security camp B", "Area B");
  c.anon = { cookies: {} };
  c.assistant = (await staffJar("assistant")).jar;
  c.admin = (await staffJar("admin")).jar;
  c.scoped = (await staffJar("admin", { campScope: [c.campB] })).jar;
  c.superAdmin = (await staffJar("super_admin")).jar;
  const deact = await staffJar("admin");
  c.deactivated = deact.jar;
  await (await db()).query("update users set status = 'deactivated' where id = $1", [deact.user.id]);
  c.pA = await registerParticipant({ campId: c.campA });
  c.pB = await registerParticipant({ campId: c.campB });
  const up = await call(intakePhoto.POST, req("POST", "/api/intake/photo", { jar: c.pA.jar, raw: await syntheticPortrait(1), headers: { "idempotency-key": key() } }));
  c.photoA = up.json.id;
  await call(questionnaire.POST, req("POST", "/api/intake/questionnaire", { jar: c.pA.jar, body: { answers: COMPLETE_ANSWERS, complete: true, idempotencyKey: key() } }));
  const ex = await call(action.POST, req("POST", `/api/patients/${c.pA.patientId}/exam`, { jar: c.admin, body: { examCompleted: "yes", mouthOpening: "normal", oralFindings: ["no_abnormality"], lesionSites: [], lesionPresent: "no", clinicalImpression: "normal" } }), { id: c.pA.patientId, action: "exam" });
  await call(action.POST, req("POST", `/api/patients/${c.pA.patientId}/verify`, { jar: c.admin, body: { examId: ex.json.examId } }), { id: c.pA.patientId, action: "verify" });
  const rep = await call(action.POST, req("POST", `/api/patients/${c.pA.patientId}/report`, { jar: c.admin, body: {} }), { id: c.pA.patientId, action: "report" });
  c.reportA = rep.json.reportId;
});

describe("role × endpoint matrix (server-side authorization)", () => {
  const cases: [string, (j: Jar) => Promise<number>, Partial<Record<"anon" | "assistant" | "admin" | "superAdmin" | "deactivated", number>>][] = [
    ["GET /api/patients", async (j) => (await call(patients.GET, req("GET", "/api/patients", { jar: j }))).status, { anon: 401, assistant: 403, admin: 200, superAdmin: 200, deactivated: 401 }],
    ["GET /api/patients/:id", async (j) => (await call(patient.GET, req("GET", `/api/patients/${c.pA.patientId}`, { jar: j }), { id: c.pA.patientId })).status, { anon: 401, assistant: 403, admin: 200, superAdmin: 200, deactivated: 401 }],
    ["GET /api/photos/:id", async (j) => (await call(photos.GET, req("GET", `/api/photos/${c.photoA}`, { jar: j }), { id: c.photoA })).status, { anon: 401, assistant: 403, admin: 200, superAdmin: 200, deactivated: 401 }],
    ["GET /api/reports/:id", async (j) => (await call(reports.GET, req("GET", `/api/reports/${c.reportA}`, { jar: j }), { id: c.reportA })).status, { anon: 401, assistant: 403, admin: 200, superAdmin: 200 }],
    ["POST exam", async (j) => (await call(action.POST, req("POST", `/api/patients/${c.pA.patientId}/exam`, { jar: j, body: { examCompleted: "unable_or_refused", oralFindings: [], lesionSites: [] } }), { id: c.pA.patientId, action: "exam" })).status, { anon: 401, assistant: 403, superAdmin: 403, deactivated: 401 }],
    ["GET /api/admin/users", async (j) => (await call(users.GET, req("GET", "/api/admin/users", { jar: j }))).status, { anon: 401, assistant: 403, admin: 403, superAdmin: 200 }],
    ["POST /api/admin/camps", async (j) => (await call(camps.POST, req("POST", "/api/admin/camps", { jar: j, body: { code: `X-${Math.floor(Math.random() * 1e6)}`, name: "X camp", workingArea: "X area", status: "planned", isPublic: false } }))).status, { assistant: 403, admin: 403, superAdmin: 201 }],
    ["GET /api/admin/audit", async (j) => (await call(auditApi.GET, req("GET", "/api/admin/audit", { jar: j }))).status, { anon: 401, assistant: 403, admin: 403, superAdmin: 200 }],
    ["GET /api/analytics", async (j) => (await call(analytics.GET, req("GET", "/api/analytics", { jar: j }))).status, { anon: 401, assistant: 200, admin: 200, superAdmin: 200 }],
    ["GET /api/exports/deidentified", async (j) => (await call(exportsApi.GET, req("GET", "/api/exports/deidentified", { jar: j }))).status, { anon: 401, assistant: 200, admin: 403, superAdmin: 200 }],
  ];
  for (const [name, run, expected] of cases) {
    for (const [role, status] of Object.entries(expected)) {
      it(`${name} as ${role} → ${status}`, async () => {
        expect(await run(c[role as keyof Ctx] as Jar)).toBe(status);
      });
    }
  }
});

describe("object-level authorization (IDOR / BOLA)", () => {
  it("a camp-scoped admin cannot read, photograph or act on another camp's participant", async () => {
    expect((await call(patient.GET, req("GET", `/api/patients/${c.pA.patientId}`, { jar: c.scoped }), { id: c.pA.patientId })).status).toBe(404);
    expect((await call(photos.GET, req("GET", `/api/photos/${c.photoA}`, { jar: c.scoped }), { id: c.photoA })).status).toBe(404);
    expect((await call(reports.GET, req("GET", `/api/reports/${c.reportA}`, { jar: c.scoped }), { id: c.reportA })).status).toBe(404);
    expect((await call(action.POST, req("POST", `/api/patients/${c.pA.patientId}/checkin`, { jar: c.scoped, body: {} }), { id: c.pA.patientId, action: "checkin" })).status).toBe(404);
    const list = await call(patients.GET, req("GET", "/api/patients?limit=50", { jar: c.scoped }));
    expect(list.json.items.every((i: { campId: string }) => i.campId === c.campB)).toBe(true);
    // Filter tampering does not widen scope
    const forced = await call(patients.GET, req("GET", `/api/patients?campId=${c.campA}`, { jar: c.scoped }));
    expect(forced.json.items).toHaveLength(0);
  });

  it("signed thumbnail links only work with the session they were issued to", async () => {
    const list = await call(patients.GET, req("GET", `/api/patients?q=${c.pA.displayId}`, { jar: c.admin }));
    const url = list.json.items[0].photo.thumbUrl as string;
    expect((await call(photos.GET, req("GET", url, { jar: c.admin }), { id: c.photoA })).status).toBe(200);
    // Copied into another (out-of-scope) staff session → signature fails → full check → 404.
    expect((await call(photos.GET, req("GET", url, { jar: c.scoped }), { id: c.photoA })).status).toBe(404);
    // No cookie at all → 401.
    expect((await call(photos.GET, req("GET", url), { id: c.photoA })).status).toBe(401);
    // Tampered patient id or expiry → falls back to the full check (admin still authorised for the real photo only).
    const forged = url.replace(/e=\d+/, "e=9999999999");
    expect((await call(photos.GET, req("GET", forged, { jar: c.scoped }), { id: c.photoA })).status).toBe(404);
  });

  it("missing and forbidden records are indistinguishable", async () => {
    const random = crypto.randomUUID();
    const a = await call(patient.GET, req("GET", `/api/patients/${random}`, { jar: c.scoped }), { id: random });
    const b = await call(patient.GET, req("GET", `/api/patients/${c.pA.patientId}`, { jar: c.scoped }), { id: c.pA.patientId });
    expect(a.status).toBe(b.status);
    expect(a.json.error).toEqual(b.json.error);
  });

  it("a participant cannot reach another participant's photo or staff APIs", async () => {
    expect((await call(photos.GET, req("GET", `/api/photos/${c.photoA}`, { jar: c.pB.jar }), { id: c.photoA })).status).toBe(404);
    expect((await call(patients.GET, req("GET", "/api/patients", { jar: c.pB.jar }))).status).toBe(401);
  });

  it("search requires exact identifiers; partial names do not enumerate the directory", async () => {
    const partial = await call(patients.GET, req("GET", "/api/patients?q=Test", { jar: c.admin }));
    expect(partial.json.items).toHaveLength(0);
  });
});

describe("input handling (SQLi, XSS, mass assignment, malformed requests)", () => {
  it("treats SQL injection payloads as data", async () => {
    for (const q of ["' OR 1=1 --", "x'; drop table patients; --", "HAOC-DS-0001' OR '1'='1"]) {
      const r = await call(patients.GET, req("GET", `/api/patients?q=${encodeURIComponent(q)}`, { jar: c.admin }));
      expect(r.status).toBe(200);
      expect(r.json.items).toHaveLength(0);
    }
    expect((await (await db()).query("select count(*) from patients")).rows).toHaveLength(1);
  });

  it("rejects script markup in names and unknown fields", async () => {
    const xss = await call(register.POST, req("POST", "/api/intake/register", { body: registration({ fullName: "<script>alert(1)</script>" }), headers: { "x-forwarded-for": randomIp() } }));
    expect(xss.status).toBe(422);
    const mass = await call(register.POST, req("POST", "/api/intake/register", { body: { ...registration(), status: "verified", groupCode: 1 }, headers: { "x-forwarded-for": randomIp() } }));
    expect(mass.status).toBe(422);
    expect(mass.json.error.fields._).toBe("Unexpected field");
  });

  it("returns safe errors for malformed, oversized and wrongly-typed bodies", async () => {
    const malformed = await call(register.POST, req("POST", "/api/intake/register", { body: "{not json", headers: { "x-forwarded-for": randomIp() } }));
    expect(malformed.status).toBe(400);
    const big = await call(register.POST, req("POST", "/api/intake/register", { body: JSON.stringify({ pad: "x".repeat(70_000) }), headers: { "x-forwarded-for": randomIp() } }));
    expect(big.status).toBe(413);
    const form = await call(register.POST, req("POST", "/api/intake/register", { body: "a=b", headers: { "content-type": "application/x-www-form-urlencoded", "x-forwarded-for": randomIp() } }));
    expect(form.status).toBe(415);
    for (const r of [malformed, big, form]) expect(r.text).not.toMatch(/at \w+ \(|node_modules|stack|SELECT|postgres/i);
  });

  it("cannot skip workflow steps by calling APIs directly", async () => {
    const p = await registerParticipant();
    const report = await call(action.POST, req("POST", `/api/patients/${p.patientId}/report`, { jar: c.admin, body: {} }), { id: p.patientId, action: "report" });
    expect(report.status).toBe(409);
    const fu = await call(action.POST, req("POST", `/api/patients/${p.patientId}/followup`, { jar: c.admin, body: { referralRequired: "no", followUpRequired: false } }), { id: p.patientId, action: "followup" });
    expect(fu.status).toBe(409);
    const wa = await call(action.POST, req("POST", `/api/patients/${c.pA.patientId}/whatsapp`, { jar: c.admin, body: { reportId: c.reportA, idempotencyKey: key() } }), { id: c.pA.patientId, action: "whatsapp" });
    expect(wa.status).toBe(409); // integration not configured → gate blocks, nothing is sent
  });
});

describe("CSRF, origin and session controls", () => {
  it("blocks cross-site and token-less state changes", async () => {
    const evil = await call(action.POST, req("POST", `/api/patients/${c.pA.patientId}/checkin`, { jar: c.admin, body: {}, origin: "https://evil.example" }), { id: c.pA.patientId, action: "checkin" });
    expect(evil.status).toBe(403);
    const noToken = await call(action.POST, req("POST", `/api/patients/${c.pA.patientId}/checkin`, { jar: { cookies: c.admin.cookies }, body: {} }), { id: c.pA.patientId, action: "checkin" });
    expect(noToken.json.error.code).toBe("csrf_failed");
    const noOrigin = await call(register.POST, req("POST", "/api/intake/register", { body: registration(), origin: null }));
    expect(noOrigin.status).toBe(403);
  });

  it("rate-limits brute force on login and token exchange", async () => {
    const ip = randomIp();
    let last = 0;
    for (let i = 0; i < 12; i++) last = (await call(login.POST, req("POST", "/api/auth/login", { body: { email: `x${i}@example.test`, password: "x" }, headers: { "x-forwarded-for": ip } }))).status;
    expect(last).toBe(429);
    let t = 0;
    for (let i = 0; i < 22; i++) t = (await call(session.POST, req("POST", "/api/intake/session", { body: { token: "A".repeat(43) }, headers: { "x-forwarded-for": ip } }))).status;
    expect(t).toBe(429);
  });

  it("spoofed X-Forwarded-For prefixes cannot dodge IP rate limits", async () => {
    const proxySeen = randomIp();
    let last = 0;
    for (let i = 0; i < 12; i++) {
      const spoof = `${i}.${i}.${i}.${i}, ${proxySeen}`; // client-supplied left part, proxy-appended right part
      last = (await call(login.POST, req("POST", "/api/auth/login", { body: { email: `s${i}@example.test`, password: "x" }, headers: { "x-forwarded-for": spoof } }))).status;
    }
    expect(last).toBe(429);
  });

  it("forged session cookies are rejected", async () => {
    const forged: Jar = { cookies: { ds_session: "A".repeat(43) }, csrf: "x" };
    expect((await call(patients.GET, req("GET", "/api/patients", { jar: forged }))).status).toBe(401);
  });

  it("rejects unsigned webhooks", async () => {
    expect((await call(webhook.POST, req("POST", "/api/webhooks/whatsapp", { body: { entry: [] }, origin: null }))).status).toBe(404); // disabled unless configured
  });
});

describe("security headers", () => {
  it("the proxy sets a nonce-based CSP and noindex on private routes", () => {
    const res = proxy(new NextRequest("http://localhost:3000/workspace/admin"));
    const csp = res.headers.get("content-security-policy")!;
    expect(csp).toMatch(/script-src 'self' 'nonce-[A-Za-z0-9+/=]+' 'strict-dynamic'/);
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("object-src 'none'");
    expect(res.headers.get("x-robots-tag")).toContain("noindex");
    const pub = proxy(new NextRequest("http://localhost:3000/faq"));
    expect(pub.headers.get("x-robots-tag")).toBeNull();
  });

  it("static headers include HSTS, nosniff, referrer, permissions and frame policies", async () => {
    const [rule] = await nextConfig.headers!();
    const map = Object.fromEntries(rule!.headers.map((h: { key: string; value: string }) => [h.key, h.value]));
    expect(map["Strict-Transport-Security"]).toMatch(/max-age=\d{8}/);
    expect(map["X-Content-Type-Options"]).toBe("nosniff");
    expect(map["X-Frame-Options"]).toBe("DENY");
    expect(map["Referrer-Policy"]).toBe("strict-origin-when-cross-origin");
    expect(map["Permissions-Policy"]).toContain("camera=(self)");
    expect(map["Permissions-Policy"]).toContain("geolocation=()");
    expect(nextConfig.poweredByHeader).toBe(false);
    expect(nextConfig.productionBrowserSourceMaps).toBe(false);
  });
});
