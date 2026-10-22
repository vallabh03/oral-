import assert from "node:assert/strict";
import { test } from "node:test";
import { sanitize, measure } from "../lib/telemetry.ts";

test("telemetry sanitize redacts sensitive PII and secrets", () => {
  const sensitivePayload = {
    username: "doctor_rao",
    password: "supersecretpassword",
    token: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9",
    authorization: "Bearer secret-token",
    phone: "+919876543210",
    patientName: "John Doe",
    nested: {
      key: "secret-key",
      safeValue: "Normal diagnostic data",
    },
  };

  const clean = sanitize(sensitivePayload) as Record<string, any>;
  assert.equal(clean.username, "doctor_rao");
  assert.equal(clean.password, "[REDACTED]");
  assert.equal(clean.token, "[REDACTED]");
  assert.equal(clean.authorization, "[REDACTED]");
  assert.equal(clean.phone, "[REDACTED]");
  assert.equal(clean.nested.key, "[REDACTED]");
  assert.equal(clean.nested.safeValue, "Normal diagnostic data");
});

test("telemetry measure tracks duration and returns result", async () => {
  const { result, durationMs } = await measure("test-op", async () => {
    return 42;
  });

  assert.equal(result, 42);
  assert.ok(typeof durationMs === "number");
  assert.ok(durationMs >= 0);
});
