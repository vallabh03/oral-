import { describe, expect, it } from "vitest";
import { db } from "@/lib/server/db";
import { verifyAuditChain } from "@/lib/server/audit";
import { resetPatientData } from "../../scripts/reset-patient-data";
import { call, COMPLETE_ANSWERS, key, registerParticipant, req, seedCamp, staffJar, syntheticPortrait } from "../helpers";
import * as questionnaire from "@/app/api/intake/questionnaire/route";
import * as intakePhoto from "@/app/api/intake/photo/route";

describe("reset-patient-data (go-live clean-up)", () => {
  it("removes every participant record and stored photo, keeps staff, camps and the audit log, and restarts IDs", async () => {
    const d = await db();
    await staffJar("super_admin", { email: "keep-me@example.test" });
    const camp = await seedCamp("RST-A", "Reset test camp", "Area R");
    for (let i = 0; i < 3; i++) {
      const p = await registerParticipant({ fullName: `Synthetic Person ${"ABC"[i]}` });
      await call(questionnaire.POST, req("POST", "/api/intake/questionnaire", { jar: p.jar, body: { answers: COMPLETE_ANSWERS, complete: true, idempotencyKey: key() } }));
      const up = await call(intakePhoto.POST, req("POST", "/api/intake/photo", { jar: p.jar, raw: await syntheticPortrait(i + 1), headers: { "idempotency-key": key() } }));
      expect(up.status).toBe(201);
    }
    const count = async (t: string) => (await d.query<{ n: number }>(`select count(*)::int as n from ${t}`)).rows[0]!.n;
    expect(await count("patients")).toBe(3);
    expect(await count("blob_objects")).toBeGreaterThan(0);
    const auditBefore = await count("audit_events");

    const r = await resetPatientData();
    expect(r).toMatchObject({ patients: 3, fileErrors: 0 });
    expect(r.files).toBe(6); // photo + thumbnail each

    for (const t of ["patients", "consents", "questionnaire_submissions", "questionnaire_answers", "intake_sessions", "intake_tokens", "patient_photos", "blob_objects", "notifications", "virtual_cases"]) {
      expect(await count(t), t).toBe(0);
    }
    expect((await d.query("select 1 from users where email = 'keep-me@example.test'")).rows).toHaveLength(1);
    expect((await d.query("select 1 from camps where id = $1", [camp])).rows).toHaveLength(1);
    expect(await count("audit_events")).toBeGreaterThan(auditBefore);
    expect((await d.query("select 1 from audit_events where action = 'admin.reset_patient_data'")).rows).toHaveLength(1);
    expect((await verifyAuditChain()).ok).toBe(true);

    const next = await registerParticipant({ fullName: "Synthetic Person A" }); // same name + mobile no longer counts as a duplicate
    expect(next.displayId).toMatch(/-0001$/);
  });
});
