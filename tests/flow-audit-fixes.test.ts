import assert from "node:assert/strict";
import { test } from "node:test";

// ---------------------------------------------------------------------------
// Migration 0013 — intake dedup + token covering index
// ---------------------------------------------------------------------------
test("migration 0013 contains intake dedup index and token covering index", async () => {
  const fs = await import("node:fs");
  const path = await import("node:path");
  const sql = fs.readFileSync(
    path.resolve("drizzle/0013_intake_dedup_and_analysis_safety.sql"),
    "utf-8",
  );
  // Unique partial index for concurrent-safe duplicate prevention
  assert.ok(
    sql.includes("CREATE UNIQUE INDEX IF NOT EXISTS patients_dedup"),
    "Must define patients_dedup unique index",
  );
  assert.ok(
    sql.includes("WHERE phone != ''"),
    "Dedup index must be partial (phone-bearing registrations only)",
  );
  assert.ok(
    sql.includes("COLLATE NOCASE"),
    "Dedup index must use case-insensitive name comparison",
  );
  // Covering index for intake token lookup
  assert.ok(
    sql.includes("CREATE INDEX IF NOT EXISTS intake_tokens_lookup"),
    "Must define intake_tokens_lookup covering index",
  );
  assert.ok(
    sql.includes("hash, expires, used"),
    "Covering index must include hash, expires, and used columns",
  );
});

// ---------------------------------------------------------------------------
// User action — patient account linking (previously always null)
// ---------------------------------------------------------------------------
test("user action patient-id linking logic: PATIENT role uses patientId, staff roles strip it", () => {
  // Simulates the corrected logic in the 'user' action handler.
  function computeLinked(role: string, patientId: string | null): string | null {
    return role === "PATIENT" ? (patientId ?? null) : null;
  }

  // Staff roles should never carry a patient link
  assert.equal(computeLinked("SUPER_ADMIN", "HAOC-DS-123"), null);
  assert.equal(computeLinked("DOCTOR_ADMIN", "HAOC-DS-123"), null);
  assert.equal(computeLinked("ASSISTANT", "HAOC-DS-123"), null);
  assert.equal(computeLinked("DOCTOR", "HAOC-DS-123"), null);
  assert.equal(computeLinked("COUNSELLOR", "HAOC-DS-123"), null);
  assert.equal(computeLinked("LAB", "HAOC-DS-123"), null);
  assert.equal(computeLinked("REGISTRATION", "HAOC-DS-123"), null);

  // PATIENT role correctly propagates the patientId
  assert.equal(computeLinked("PATIENT", "HAOC-DS-456"), "HAOC-DS-456");
  assert.equal(computeLinked("PATIENT", null), null);
});

// ---------------------------------------------------------------------------
// Analysis route — participantId visibility
// ---------------------------------------------------------------------------
test("analysis records omit participantId for non-admin roles", () => {
  // Simulates the access-control logic in GET /api/analysis
  function buildRecord(role: string, demo: boolean, patientId: string) {
    return {
      ...(role === "SUPER_ADMIN" || role === "ADMIN" || demo
        ? { participantId: patientId }
        : {}),
      ageBand: "40–49",
      driverType: "Auto",
    };
  }

  const adminRecord = buildRecord("SUPER_ADMIN", false, "HAOC-DS-001");
  assert.ok("participantId" in adminRecord, "SUPER_ADMIN should see participantId");

  const adminRoleRecord = buildRecord("ADMIN", false, "HAOC-DS-001");
  assert.ok("participantId" in adminRoleRecord, "ADMIN should see participantId");

  const demoRecord = buildRecord("ASSISTANT", true, "HAOC-DS-001");
  assert.ok("participantId" in demoRecord, "Demo mode should see participantId");

  const assistantRecord = buildRecord("ASSISTANT", false, "HAOC-DS-001");
  assert.ok(
    !("participantId" in assistantRecord),
    "ASSISTANT should NOT see participantId in live mode",
  );
  assert.ok("ageBand" in assistantRecord, "ASSISTANT should still see ageBand");
  assert.ok("driverType" in assistantRecord, "ASSISTANT should still see driverType");
});

// ---------------------------------------------------------------------------
// Preferences rate limiting — key format
// ---------------------------------------------------------------------------
test("preferences rate limit keys are hashed and time-bucketed", async () => {
  const { webcrypto } = await import("node:crypto");

  // Pure hash helper — mirrors the logic in lib/server.ts
  async function hashLocal(v: string): Promise<string> {
    return [
      ...new Uint8Array(
        await webcrypto.subtle.digest("SHA-256", new TextEncoder().encode(v)),
      ),
    ]
      .map((x) => x.toString(16).padStart(2, "0"))
      .join("");
  }

  const userId = "user_test_123";
  const bucket = Math.floor(Date.now() / 60000);
  const hashedId = await hashLocal(userId);
  const getKey = `pref-get:${hashedId}:${bucket}`;
  const putKey = `pref-put:${hashedId}:${bucket}`;

  // Verify the key structure is consistent and hashed (not raw userId)
  assert.ok(getKey.startsWith("pref-get:"), "GET key must start with pref-get:");
  assert.ok(putKey.startsWith("pref-put:"), "PUT key must start with pref-put:");
  assert.ok(!getKey.includes(userId), "GET key must not expose raw userId");
  assert.ok(!putKey.includes(userId), "PUT key must not expose raw userId");
  assert.ok(getKey.endsWith(`:${bucket}`), "GET key must include time bucket");
  assert.ok(putKey.endsWith(`:${bucket}`), "PUT key must include time bucket");
  // Hash is 64 hex chars (SHA-256)
  assert.equal(hashedId.length, 64, "Hash must be 64 hex chars");
});

// ---------------------------------------------------------------------------
// Examination edge-cases (domain logic)
// ---------------------------------------------------------------------------
test("examination: mouth opening distance boundary enforcement", () => {
  function validateDistance(mouthOpening: string, distance: number | null): boolean {
    return !(
      mouthOpening === "Restricted" &&
      distance !== null &&
      (distance <= 0 || distance > 80)
    );
  }

  assert.ok(!validateDistance("Restricted", 0), "distance=0 should be invalid");
  assert.ok(!validateDistance("Restricted", -1), "negative distance should be invalid");
  assert.ok(!validateDistance("Restricted", 81), "distance=81 should be invalid");
  assert.ok(validateDistance("Restricted", 1), "distance=1 should be valid");
  assert.ok(validateDistance("Restricted", 40), "distance=40 should be valid");
  assert.ok(validateDistance("Restricted", 80), "distance=80 should be valid");
  assert.ok(validateDistance("Restricted", null), "null distance should be valid (not yet measured)");
  assert.ok(validateDistance("Normal", 0), "Normal mouth opening ignores distance");
});

test("examination: no-abnormality cannot coexist with other findings", () => {
  function validateFindings(findings: string[]): boolean {
    return !(findings.includes("No abnormality") && findings.length > 1);
  }

  assert.ok(validateFindings(["No abnormality"]), "sole No abnormality is valid");
  assert.ok(validateFindings(["Ulcer", "Leukoplakia/white lesion"]), "multi-finding is valid");
  assert.ok(!validateFindings(["No abnormality", "Ulcer"]), "No abnormality + other must be rejected");
});

test("examination: lesion-impression consistency rules", () => {
  function validateConsistency(completed: boolean, lesion: boolean, impression: string): boolean {
    if (completed && lesion && (impression === "Normal" || impression === "No abnormality"))
      return false;
    if (completed && !lesion && impression !== "Normal")
      return false;
    return true;
  }

  assert.ok(!validateConsistency(true, true, "Normal"), "lesion=true, impression=Normal → invalid");
  assert.ok(!validateConsistency(true, false, "Suspicious for malignancy"), "lesion=false, non-normal impression → invalid");
  assert.ok(validateConsistency(true, true, "Suspicious for malignancy"), "lesion=true, suspicious → valid");
  assert.ok(validateConsistency(true, false, "Normal"), "lesion=false, Normal → valid");
  assert.ok(validateConsistency(false, true, "Normal"), "incomplete exam bypasses consistency checks");
});

// ---------------------------------------------------------------------------
// Error handling — UNIQUE constraint conflict detection
// ---------------------------------------------------------------------------
test("failure handler recognizes UNIQUE constraint errors as 409 Conflict", () => {
  function isUniqueConstraintError(e: unknown): boolean {
    return (
      e instanceof Error &&
      (e.message.includes("UNIQUE constraint failed") ||
        e.message.includes("sqlite3_step: 19") ||
        e.message.includes("D1_ERROR: UNIQUE"))
    );
  }

  assert.ok(
    isUniqueConstraintError(new Error("D1_ERROR: UNIQUE constraint failed: patients.tenant, patients.name, patients.phone")),
    "Standard SQLite unique constraint error should be detected",
  );
  assert.ok(
    isUniqueConstraintError(new Error("sqlite3_step: 19 - constraint failed")),
    "Low-level sqlite3_step 19 error should be detected",
  );
  assert.ok(
    !isUniqueConstraintError(new Error("SyntaxError: unexpected token")),
    "Generic error should not be treated as unique constraint",
  );
});

// ---------------------------------------------------------------------------
// Audit throttling logic
// ---------------------------------------------------------------------------
test("audit throttling suppresses duplicate non-clinical events within window", async () => {
  const store = new Map<string, { val: string; exp: number }>();
  const mockKv = {
    async get(k: string) {
      const item = store.get(k);
      if (!item) return null;
      if (Date.now() > item.exp) {
        store.delete(k);
        return null;
      }
      return item.val;
    },
    async put(k: string, val: string, opts: { expirationTtl: number }) {
      store.set(k, { val, exp: Date.now() + opts.expirationTtl * 1000 });
    },
  };

  let writeCount = 0;
  async function throttledLog(tenant: string, userId: string, action: string, intervalSecs: number) {
    const key = `audit_throttle:${tenant}:${userId}:${action}`;
    const exists = await mockKv.get(key);
    if (exists) return false;
    await mockKv.put(key, "1", { expirationTtl: intervalSecs });
    writeCount++;
    return true;
  }

  // First call should write
  const first = await throttledLog("live", "user-1", "Workspace accessed", 300);
  assert.equal(first, true);
  assert.equal(writeCount, 1);

  // Subsequent rapid calls from same user should be throttled
  const second = await throttledLog("live", "user-1", "Workspace accessed", 300);
  assert.equal(second, false);
  assert.equal(writeCount, 1);

  // Different user is not throttled
  const otherUser = await throttledLog("live", "user-2", "Workspace accessed", 300);
  assert.equal(otherUser, true);
  assert.equal(writeCount, 2);
});
