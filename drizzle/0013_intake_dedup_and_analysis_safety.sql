-- Migration 0013: Intake duplicate safety + analysis safety
--
-- 1. Unique index on patients(tenant, lower(name), phone) so that a concurrent
--    double-registration cannot create two rows for the same participant even if
--    the application-level duplicate check races. SQLite's serialised write model
--    ensures exactly one of the two concurrent INSERTs will succeed.
--    Using a partial index (WHERE phone != '') avoids blocking anonymous registrations.
--
-- 2. Covering index on intake_tokens(hash, expires, used) used by the screen
--    action SELECT: eliminates a full-table scan on token lookup under camp load.

-- Unique intake dedup guard (phone-bearing registrations only).
-- If a participant without a phone number registers twice the application-level
-- check (COLLATE NOCASE name match) still applies; this index only covers the
-- fast, common case where a phone number is present.
CREATE UNIQUE INDEX IF NOT EXISTS patients_dedup
    ON patients (tenant, name COLLATE NOCASE, phone)
    WHERE phone != '';

-- Covering index for token lookup: single index seek instead of full-scan.
CREATE INDEX IF NOT EXISTS intake_tokens_lookup
    ON intake_tokens (hash, expires, used);
