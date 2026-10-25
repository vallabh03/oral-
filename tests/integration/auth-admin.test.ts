import { describe, expect, it } from "vitest";
import { db } from "@/lib/server/db";
import { totp } from "@/lib/server/security/totp";
import { devOutbox } from "@/lib/server/email";
import { verifyAuditChain } from "@/lib/server/audit";
import { call, randomIp, req, staffJar, type Jar } from "../helpers";
import { seedUser } from "../../scripts/seed-lib";
import * as login from "@/app/api/auth/login/route";
import * as mfa from "@/app/api/auth/mfa/route";
import * as enroll from "@/app/api/auth/mfa/enroll/route";
import * as logout from "@/app/api/auth/logout/route";
import * as reset from "@/app/api/auth/reset/route";
import * as users from "@/app/api/admin/users/route";
import * as user from "@/app/api/admin/users/[id]/route";
import * as camps from "@/app/api/admin/camps/route";
import * as sessions from "@/app/api/admin/sessions/route";
import * as audit from "@/app/api/admin/audit/route";
import * as patients from "@/app/api/patients/route";
import * as contact from "@/app/api/contact/route";
import * as events from "@/app/api/events/route";

describe("staff authentication", () => {
  it("uses identical errors for unknown users and wrong passwords (no enumeration)", async () => {
    const u = await seedUser("enum@example.test", "Enum", "admin");
    const a = await call(login.POST, req("POST", "/api/auth/login", { body: { email: "nobody@example.test", password: "x" }, headers: { "x-forwarded-for": randomIp() } }));
    const b = await call(login.POST, req("POST", "/api/auth/login", { body: { email: u.email, password: "wrong-password" }, headers: { "x-forwarded-for": randomIp() } }));
    expect(a.status).toBe(401);
    expect(b.status).toBe(401);
    expect(a.json.error).toEqual(b.json.error);
  });

  it("locks an account after repeated failures and rate-limits per account", async () => {
    const u = await seedUser("lock@example.test", "Lock", "admin");
    for (let i = 0; i < 5; i++) await call(login.POST, req("POST", "/api/auth/login", { body: { email: u.email, password: "nope" }, headers: { "x-forwarded-for": randomIp() } }));
    const r = await call(login.POST, req("POST", "/api/auth/login", { body: { email: u.email, password: u.password }, headers: { "x-forwarded-for": randomIp() } }));
    expect([401, 429]).toContain(r.status);
  });

  it("requires MFA before any workspace access, rotates the session, and rejects TOTP replay", async () => {
    const u = await seedUser("mfa@example.test", "MFA", "admin");
    const jar: Jar = { cookies: {} };
    const l = await call(login.POST, req("POST", "/api/auth/login", { body: { email: u.email, password: u.password }, headers: { "x-forwarded-for": randomIp() } }), {}, jar);
    expect(l.json.next).toBe("mfa");
    jar.csrf = l.json.csrfToken;
    const pendingCookie = Object.values(jar.cookies)[0];
    expect((await call(patients.GET, req("GET", "/api/patients", { jar }))).json.error.code).toBe("mfa_required");
    const code = totp(u.totpSecret);
    expect((await call(mfa.POST, req("POST", "/api/auth/mfa", { jar, body: { code: "000000" } }))).status).toBe(401);
    const ok = await call(mfa.POST, req("POST", "/api/auth/mfa", { jar, body: { code } }), {}, jar);
    expect(ok.json.redirect).toBe("/workspace/admin");
    expect(Object.values(jar.cookies)[0]).not.toBe(pendingCookie); // anti session-fixation

    // Replay the same code on a new login: rejected.
    const jar2: Jar = { cookies: {} };
    const l2 = await call(login.POST, req("POST", "/api/auth/login", { body: { email: u.email, password: u.password }, headers: { "x-forwarded-for": randomIp() } }), {}, jar2);
    jar2.csrf = l2.json.csrfToken;
    expect((await call(mfa.POST, req("POST", "/api/auth/mfa", { jar: jar2, body: { code } }))).status).toBe(401);
  });

  it("forces MFA enrolment for new accounts", async () => {
    const { jar: sa } = await staffJar("super_admin");
    const created = await call(users.POST, req("POST", "/api/admin/users", { jar: sa, body: { email: "new.doc@example.test", displayName: "New Doc", role: "admin" } }));
    expect(created.status).toBe(201);
    const token = new URL(created.json.setupUrl).hash.replace("#token=", "");
    expect((await call(reset.POST, req("POST", "/api/auth/reset", { body: { action: "complete", token, password: "short" } }))).status).toBe(422);
    const set = await call(reset.POST, req("POST", "/api/auth/reset", { body: { action: "complete", token, password: "monsoon-kettle-river-77" } }));
    // The rejected weak password rolled back, so the single-use token is still valid here.
    expect(set.status).toBe(200);
    expect((await call(reset.POST, req("POST", "/api/auth/reset", { body: { action: "complete", token, password: "another-long-pass-88" } }))).status).toBe(400);

    const jar: Jar = { cookies: {} };
    const l = await call(login.POST, req("POST", "/api/auth/login", { body: { email: "new.doc@example.test", password: "monsoon-kettle-river-77" }, headers: { "x-forwarded-for": randomIp() } }), {}, jar);
    expect(l.json.next).toBe("mfa-enroll");
    jar.csrf = l.json.csrfToken;
    const start = await call(enroll.POST, req("POST", "/api/auth/mfa/enroll", { jar, body: { action: "start" } }));
    expect(start.json.qrSvg).toContain("<svg");
    const done = await call(enroll.POST, req("POST", "/api/auth/mfa/enroll", { jar, body: { action: "confirm", code: totp(start.json.secret) } }), {}, jar);
    expect(done.status).toBe(200);
  });

  it("password reset requests never reveal whether an account exists", async () => {
    const before = devOutbox().length;
    const a = await call(reset.POST, req("POST", "/api/auth/reset", { body: { action: "request", email: "ghost@example.test" }, headers: { "x-forwarded-for": randomIp() } }));
    await seedUser("real.reset@example.test", "Real", "assistant");
    const b = await call(reset.POST, req("POST", "/api/auth/reset", { body: { action: "request", email: "real.reset@example.test" }, headers: { "x-forwarded-for": randomIp() } }));
    expect(a.json).toEqual(b.json);
    expect(devOutbox().length).toBe(before + 1);
    expect(devOutbox().at(-1)!.text).toMatch(/#token=/); // token travels in the URL fragment
  });

  it("logout invalidates the session server-side", async () => {
    const { jar } = await staffJar("admin");
    const stolen = { ...jar, cookies: { ...jar.cookies } };
    expect((await call(logout.POST, req("POST", "/api/auth/logout", { jar }))).status).toBe(200);
    expect((await call(patients.GET, req("GET", "/api/patients", { jar: stolen }))).status).toBe(401);
  });

  it("expires idle sessions", async () => {
    const { jar, user: u } = await staffJar("admin");
    const d = await db();
    await d.query("update app_sessions set last_active_at = now() - interval '31 minutes' where user_id = $1", [u.id]);
    expect((await call(patients.GET, req("GET", "/api/patients", { jar }))).status).toBe(401);
  });
});

describe("super admin governance", () => {
  it("deactivation, role change and admin revocation end sessions immediately", async () => {
    const { jar: sa } = await staffJar("super_admin");
    const { jar: doc, user: docUser } = await staffJar("admin");
    const { jar: doc2, user: docUser2 } = await staffJar("admin");
    expect((await call(patients.GET, req("GET", "/api/patients", { jar: doc }))).status).toBe(200);
    await call(user.PATCH, req("PATCH", `/api/admin/users/${docUser.id}`, { jar: sa, body: { status: "deactivated" } }), { id: docUser.id });
    expect((await call(patients.GET, req("GET", "/api/patients", { jar: doc }))).status).toBe(401);
    await call(user.PATCH, req("PATCH", `/api/admin/users/${docUser2.id}`, { jar: sa, body: { role: "assistant" } }), { id: docUser2.id });
    expect((await call(patients.GET, req("GET", "/api/patients", { jar: doc2 }))).status).toBe(401);

    const { jar: doc3, user: u3 } = await staffJar("admin");
    const list = await call(sessions.GET, req("GET", "/api/admin/sessions", { jar: sa }));
    const s = list.json.sessions.find((x: { email: string }) => x.email === u3.email);
    await call(sessions.DELETE, req("DELETE", "/api/admin/sessions", { jar: sa, body: { sessionId: s.id } }));
    expect((await call(patients.GET, req("GET", "/api/patients", { jar: doc3 }))).status).toBe(401);
  });

  it("prevents self-promotion, self-deactivation and removing the last super admin", async () => {
    const d = await db();
    await d.query("update users set status = 'deactivated' where role = 'super_admin'");
    const { jar: sa, user: me } = await staffJar("super_admin");
    expect((await call(user.PATCH, req("PATCH", `/api/admin/users/${me.id}`, { jar: sa, body: { role: "admin" } }), { id: me.id })).status).toBe(403);
    expect((await call(user.PATCH, req("PATCH", `/api/admin/users/${me.id}`, { jar: sa, body: { status: "deactivated" } }), { id: me.id })).status).toBe(403);
    const other = await seedUser("only.other.sa@example.test", "Other SA", "super_admin");
    await d.query("update users set status = 'deactivated' where id = $1", [other.id]);
    const { jar: admin } = await staffJar("admin");
    // An admin cannot call user management at all.
    expect((await call(user.PATCH, req("PATCH", `/api/admin/users/${me.id}`, { jar: admin, body: { role: "assistant" } }), { id: me.id })).status).toBe(403);
  });

  it("manages camps with validation and records everything in a verifiable audit chain", async () => {
    const { jar: sa } = await staffJar("super_admin");
    const ok = await call(camps.POST, req("POST", "/api/admin/camps", { jar: sa, body: { code: "AUD-01", name: "Audit camp", workingArea: "Kukatpally", status: "planned", isPublic: true } }));
    expect(ok.status).toBe(201);
    const dup = await call(camps.POST, req("POST", "/api/admin/camps", { jar: sa, body: { code: "AUD-01", name: "Audit camp", workingArea: "Kukatpally", status: "planned", isPublic: true } }));
    expect(dup.status).toBe(422);
    const ev = await call(audit.GET, req("GET", "/api/admin/audit?action=camp.", { jar: sa }));
    expect(ev.json.events.some((e: { action: string }) => e.action === "camp.create")).toBe(true);
    const chain = await call(audit.GET, req("GET", "/api/admin/audit?verify=1", { jar: sa }));
    expect(chain.json.ok).toBe(true);
  });

  it("detects audit tampering", async () => {
    const d = await db();
    await d.query("alter table audit_events disable trigger audit_events_no_mutation");
    await d.query("update audit_events set outcome = 'success' where seq = (select min(seq) from audit_events where outcome = 'denied')");
    await d.query("alter table audit_events enable trigger audit_events_no_mutation");
    const r = await verifyAuditChain();
    expect(r.ok).toBe(false);
    expect(r.brokenAt).not.toBeNull();
    await expect(d.query("delete from audit_events")).rejects.toThrow(/append-only/);
  });
});

describe("public endpoints", () => {
  it("contact form stores, notifies the mailbox and is idempotent", async () => {
    const body = { name: "Asha Rao", email: "asha@example.test", topic: "partner", message: "We would like to host a camp.\r\nBcc: x@y.z", idempotencyKey: "contact-key-0000000001" };
    const before = devOutbox().length;
    const a = await call(contact.POST, req("POST", "/api/contact", { body, headers: { "x-forwarded-for": randomIp() } }));
    const b = await call(contact.POST, req("POST", "/api/contact", { body, headers: { "x-forwarded-for": randomIp() } }));
    expect(a.status).toBe(201);
    expect(b.status).toBe(200);
    expect(devOutbox().length).toBe(before + 1);
    const mail = devOutbox().at(-1)!;
    expect(mail.to).toBe("programme@example.org");
    expect(mail.subject).not.toMatch(/[\r\n]/);
  });

  it("contact form is rate limited", async () => {
    const ip = randomIp();
    const statuses: number[] = [];
    for (let i = 0; i < 7; i++) {
      const r = await call(contact.POST, req("POST", "/api/contact", { body: { name: "Spam Bot", email: "s@example.test", topic: "general", message: "hello hello hello", idempotencyKey: `spam-key-${i}-0000000000` }, headers: { "x-forwarded-for": ip } }));
      statuses.push(r.status);
    }
    expect(statuses.at(-1)).toBe(429);
  });

  it("analytics accepts only allowlisted, PII-free events", async () => {
    const d = await db();
    const send = (body: unknown) => call(events.POST, req("POST", "/api/events", { body, headers: { "x-forwarded-for": randomIp() } }));
    expect((await send({ name: "registration_completed", path: "/register", utm_source: "Poster!" })).status).toBe(204);
    expect((await send({ name: "registration_completed", path: "/workspace/patients/x" })).status).toBe(204);
    expect((await send({ name: "steal_data", path: "/" })).status).toBe(204);
    expect((await send({ name: "campaign_view", path: "/", mobile: "9876543210" })).status).toBe(422);
    const rows = (await d.query<{ name: string; path: string; utm_source: string }>("select name, path, utm_source from analytics_events")).rows;
    expect(rows).toEqual([{ name: "registration_completed", path: "/register", utm_source: "poster" }]);
  });
});
