-- Migration 0012: Performance hardening for high-concurrency deployment
--
-- Problem: With 500-4999 concurrent users, several high-frequency queries
-- lack covering indexes and force full (patient-scoped) table scans:
--   - responses ORDER BY at         → full scan then sort
--   - records   ORDER BY at DESC    → full scan then sort
--   - audit     ORDER BY at DESC    → covered by (patient_id,at) but not DESC
--   - limits GC sweep               → no index on expires
--   - app_errors GC sweep           → only (at) index, fine
--   - camps     WHERE tenant=?      → full table scan
--
-- All changes are ADDITIVE (CREATE INDEX IF NOT EXISTS).
-- No data is removed. Zero-downtime safe on D1.

-- 1. Covering index for responses ordered by time per patient
--    Fixes: SELECT ... FROM responses WHERE patient_id=? ORDER BY at
CREATE INDEX IF NOT EXISTS responses_patient_at ON responses (patient_id, at);

-- 2. Covering index for records ordered by time per patient
--    Fixes: SELECT ... FROM records WHERE patient_id=? ORDER BY at DESC
CREATE INDEX IF NOT EXISTS records_patient_at ON records (patient_id, at);

-- 3. Covering index for audit patient timeline (ORDER BY at DESC)
--    Complements existing audit_patient (patient_id, at).
--    SQLite can use the existing index for ASC; this is for explicit DESC planning.
CREATE INDEX IF NOT EXISTS audit_patient_at_desc ON audit (patient_id, at DESC);

-- 4. Partial index to speed up probabilistic GC on limits table
--    Fixes: DELETE FROM limits WHERE expires < ?
CREATE INDEX IF NOT EXISTS limits_expires ON limits (expires);

-- 5. camps tenant index — fixes workspace GET (SELECT * FROM camps WHERE tenant=?)
--    Currently a full table scan; at camp scale this is fine, but at high
--    concurrency with many tenants the shared scan is wasteful.
CREATE INDEX IF NOT EXISTS camps_tenant ON camps (tenant);

-- 6. Partial index for app_errors GC cleanup (future cron-based pruning)
--    The errors_at index added in 0011 already covers ORDER BY at DESC LIMIT 30.
--    This alias index supports WHERE at < ? DELETE pattern for the cron GC.
--    (No-op if errors_at already satisfies the planner — harmless either way.)
CREATE INDEX IF NOT EXISTS errors_gc ON app_errors (at);
