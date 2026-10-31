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

  const clean = sanitize(sensitivePayload) as Record<string, unknown>;
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

test("migration 0012 covers all performance hardening indexes", async () => {
  const fs = await import("node:fs");
  const path = await import("node:path");
  const sql = fs.readFileSync(path.resolve("drizzle/0012_performance_hardening.sql"), "utf-8");
  assert.ok(sql.includes("CREATE INDEX IF NOT EXISTS responses_patient_at"));
  assert.ok(sql.includes("CREATE INDEX IF NOT EXISTS records_patient_at"));
  assert.ok(sql.includes("CREATE INDEX IF NOT EXISTS audit_patient_at_desc"));
  assert.ok(sql.includes("CREATE INDEX IF NOT EXISTS limits_expires"));
  assert.ok(sql.includes("CREATE INDEX IF NOT EXISTS camps_tenant"));
  assert.ok(sql.includes("CREATE INDEX IF NOT EXISTS errors_gc"));
});

test("vector SVG QR code generates quickly and produces valid SVG markup", async () => {
  const QRCode = (await import("qrcode")).default;
  // warm-up JIT and module initialization
  await QRCode.toString("HAOC-DS-WARMUP", { type: "svg" });

  const start = performance.now();
  const svg = await QRCode.toString("HAOC-DS-TEST-QR-TOKEN", {
    type: "svg",
    width: 220,
    margin: 2,
    errorCorrectionLevel: "M",
    color: { dark: "#34383c", light: "#ffffff" },
  });
  const duration = performance.now() - start;

  assert.ok(duration < 25, `Warm QR SVG generation took ${duration}ms, expected < 25ms`);
  assert.ok(svg.includes("<svg"), "Must produce valid SVG markup");
  assert.ok(svg.includes("viewBox"), "Must contain viewBox attribute");
});
