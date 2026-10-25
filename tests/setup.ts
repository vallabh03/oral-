// Every test file gets an isolated in-memory Postgres (PGlite) and synthetic data only.
process.env.APP_ENV = "test";
process.env.PGLITE_DIR = "memory://";
process.env.DATABASE_URL = "";
process.env.STORAGE_DRIVER = "db";
process.env.EMAIL_DRIVER = "console";
process.env.INTAKE_ENABLED = "true";
process.env.NEXT_PUBLIC_SITE_URL = "http://localhost:3000";
process.env.AUDIT_HMAC_SECRET = "test-audit-secret-0123456789abcdefghijklmnop";
process.env.DATA_ENCRYPTION_KEY = "test-data-key-0123456789abcdefghijklmnopqrst";
process.env.INDEXING_ENABLED = "true";
process.env.CLINICAL_IMAGES_ENABLED = "true";
