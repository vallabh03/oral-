import { describe, expect, it } from "vitest";
import { db } from "@/lib/server/db";
import { purgeExpiredRecords } from "@/lib/server/maintenance";
import { hashToken } from "@/lib/server/security/crypto";

describe("maintenance purge worker", () => {
  it("purges expired ephemeral records without affecting active ones", async () => {
    const d = await db();

    // Insert an expired rate limit and an active one
    await d.query(
      "insert into rate_limits (bucket, window_start, count) values ('test:expired', now() - interval '3 hours', 10), ('test:active', now() - interval '10 minutes', 5)",
    );

    // Insert an expired OTP and an active one
    const pId = (
      await d.query<{ id: string }>(
        "insert into patients (display_id, full_name, age, driver_type, recruitment_source, created_via) values ('MAINT-0001', 'Maint Test', 30, 'auto', 'stand', 'self') returning id",
      )
    ).rows[0]!.id;

    await d.query(
      "insert into participant_otps (patient_id, code_hash, expires_at) values ($1, $2, now() - interval '25 hours'), ($1, $3, now() + interval '10 minutes')",
      [pId, hashToken("111111"), hashToken("222222")],
    );

    // Insert an expired intake session and an active one
    await d.query(
      "insert into intake_sessions (patient_id, token_hash, expires_at) values ($1, $2, now() - interval '25 hours'), ($1, $3, now() + interval '1 hour')",
      [pId, hashToken("sess-expired"), hashToken("sess-active")],
    );

    const result = await purgeExpiredRecords();

    expect(result.rateLimitsPurged).toBeGreaterThanOrEqual(1);
    expect(result.otpsPurged).toBeGreaterThanOrEqual(1);
    expect(result.intakeSessionsPurged).toBeGreaterThanOrEqual(1);

    // Verify active records remain intact
    const activeRl = await d.query("select 1 from rate_limits where bucket = 'test:active'");
    expect(activeRl.rows.length).toBe(1);

    const activeOtp = await d.query("select 1 from participant_otps where patient_id = $1 and expires_at > now()", [pId]);
    expect(activeOtp.rows.length).toBe(1);

    const activeIntake = await d.query("select 1 from intake_sessions where patient_id = $1 and expires_at > now()", [pId]);
    expect(activeIntake.rows.length).toBe(1);
  });
});
