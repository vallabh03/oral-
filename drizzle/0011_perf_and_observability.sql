-- Migration 0011: Performance & observability improvements
--
-- What this migration does:
--  1. Extends app_errors with message, path, actor columns for structured logging.
--  2. Adds index on app_errors(at) for ORDER BY at DESC queries.
--  3. Adds two indexes on app_sessions for active-session queries and user-based revocation.
--  4. Adds cursor-pagination index on patients(tenant, created_at).
--  5. Adds audit ordering index on audit(tenant) to support ORDER BY at DESC efficiently.
--
-- Safety: All changes are ADDITIVE (ADD COLUMN / CREATE INDEX IF NOT EXISTS).
-- No data is removed. Can be applied with zero downtime on D1.

-- 1. Extend app_errors
ALTER TABLE app_errors ADD COLUMN message TEXT;
ALTER TABLE app_errors ADD COLUMN path    TEXT;
ALTER TABLE app_errors ADD COLUMN actor   TEXT;

-- 2. Index for error log queries (ORDER BY at DESC LIMIT 30/500)
CREATE INDEX IF NOT EXISTS errors_at ON app_errors (at);

-- 3. app_sessions indexes
--    sessions_user   — used by DELETE /session revocation by user_id, and admin session list
--    sessions_active — used by admin dashboard: WHERE revoked=0 AND expires_at>? AND last_seen>?
CREATE INDEX IF NOT EXISTS sessions_user   ON app_sessions (user_id);
CREATE INDEX IF NOT EXISTS sessions_active ON app_sessions (revoked, expires_at, last_seen);

-- 4. patients cursor-pagination index
--    Supports: WHERE tenant=? AND created_at <= ? ORDER BY created_at DESC LIMIT ?
CREATE INDEX IF NOT EXISTS patients_tenant_created ON patients (tenant, created_at);

-- 5. Audit ordering index
--    Fixes: SELECT ... FROM audit WHERE tenant=? ORDER BY rowid DESC
--    The existing (tenant, at) index covers filtered+sorted queries.
--    This standalone index lets the planner choose rowid ordering cheaply.
CREATE INDEX IF NOT EXISTS audit_tenant_rowid ON audit (tenant);
