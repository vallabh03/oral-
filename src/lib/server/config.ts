import "server-only";
import os from "node:os";
import { z } from "zod";

const bool = (def: boolean) =>
  z
    .enum(["true", "false", "1", "0", ""])
    .optional()
    .transform((v) => (v === undefined || v === "" ? def : v === "true" || v === "1"));

// Production rules apply to production builds unless APP_ENV explicitly says development/test
// (e.g. running `next start` locally against embedded PGlite). Staging is treated as production.
const isProd = process.env.NODE_ENV === "production" && !["development", "test"].includes(process.env.APP_ENV ?? "");

const schema = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  APP_ENV: z.enum(["development", "test", "staging", "production"]).optional(),
  NEXT_PUBLIC_SITE_URL: z.string().url().default("http://localhost:3000"),
  DATABASE_URL: z.string().optional(),
  PGLITE_DIR: z.string().default(".data/pglite"),
  DB_POOL_MAX: z.coerce.number().int().min(1).max(100).default(10),
  STORAGE_DRIVER: z.enum(["db", "local", "s3"]).default("db"),
  LOCAL_STORAGE_DIR: z.string().default(".data/objects"),
  S3_BUCKET: z.string().optional(),
  S3_KMS_KEY_ID: z.string().optional(),
  AWS_REGION: z.string().default("ap-south-2"),
  PHOTO_MAX_UPLOAD_BYTES: z.coerce.number().int().min(50_000).max(10_000_000).default(3 * 1024 * 1024),
  PHOTO_PROCESS_CONCURRENCY: z.coerce.number().int().min(1).max(64).optional(),
  PHOTO_QUEUE_LIMIT: z.coerce.number().int().min(1).max(10_000).default(200),
  AUDIT_HMAC_SECRET: z.string().optional(),
  DATA_ENCRYPTION_KEY: z.string().optional(),
  AUTH_PASSWORD_ENABLED: bool(true),
  OIDC_ENABLED: bool(false),
  OIDC_ISSUER: z.string().optional(),
  OIDC_CLIENT_ID: z.string().optional(),
  OIDC_CLIENT_SECRET: z.string().optional(),
  OIDC_REDIRECT_URI: z.string().optional(),
  INTAKE_ENABLED: bool(!isProd),
  PARTICIPANT_ID_PREFIX: z.string().regex(/^[A-Z]{2,8}(-[A-Z]{2,8})?$/).default("HAOC-DS"),
  EMAIL_DRIVER: z.enum(["console", "ses"]).default("console"),
  // SES is not offered in every region; send from a nearby one (e.g. ap-south-1) if needed.
  SES_REGION: z.string().optional(),
  EMAIL_FROM: z.string().email().default("no-reply@example.org"),
  CONTACT_TO_EMAIL: z.string().email().default("programme@example.org"),
  WHATSAPP_ENABLED: bool(false),
  WHATSAPP_TOKEN: z.string().optional(),
  WHATSAPP_PHONE_NUMBER_ID: z.string().optional(),
  WHATSAPP_APP_SECRET: z.string().optional(),
  // Clinical lesion photography (PRD v1.2). OFF unless explicitly enabled: it must stay off for
  // live patient data until the photography protocol, consent, access scope and retention
  // policy are approved by the programme, clinical, privacy and security owners.
  CLINICAL_IMAGES_ENABLED: bool(false),
  CLINICAL_IMAGE_MAX_BYTES: z.coerce.number().int().min(500_000).max(40_000_000).default(15 * 1024 * 1024),
  CLINICAL_S3_BUCKET: z.string().optional(),
  CLINICAL_S3_KMS_KEY_ID: z.string().optional(),
});

export type AppConfig = z.infer<typeof schema> & { isProd: boolean; photoConcurrency: number; auditSecret: string; dataKey: string };

const DEV_ONLY_SECRET = "dev-only-insecure-secret-do-not-use-in-production-000";

function load(): AppConfig {
  const parsed = schema.safeParse(process.env);
  if (!parsed.success) {
    // Never print values — only the names of invalid variables.
    throw new Error(`Invalid configuration: ${parsed.error.issues.map((i) => i.path.join(".")).join(", ")}`);
  }
  const c = parsed.data;
  const strong = (s?: string) => !!s && s.length >= 32 && s !== DEV_ONLY_SECRET;
  if (isProd) {
    if (!c.DATABASE_URL) throw new Error("DATABASE_URL is required in production");
    if (!strong(c.AUDIT_HMAC_SECRET)) throw new Error("AUDIT_HMAC_SECRET must be a strong secret in production");
    if (!strong(c.DATA_ENCRYPTION_KEY)) throw new Error("DATA_ENCRYPTION_KEY must be a strong secret in production");
    if (c.STORAGE_DRIVER === "s3" && !c.S3_BUCKET) throw new Error("S3_BUCKET is required when STORAGE_DRIVER=s3");
    if (c.CLINICAL_IMAGES_ENABLED) {
      // Clinical images in production: private S3 only, in their own bucket, with their own KMS key.
      if (c.STORAGE_DRIVER !== "s3") throw new Error("Clinical images require STORAGE_DRIVER=s3 in production");
      if (!c.CLINICAL_S3_BUCKET || c.CLINICAL_S3_BUCKET === c.S3_BUCKET) throw new Error("CLINICAL_S3_BUCKET must be a separate private bucket when clinical images are enabled");
      if (!c.CLINICAL_S3_KMS_KEY_ID) throw new Error("CLINICAL_S3_KMS_KEY_ID is required when clinical images are enabled");
    }
    if (!c.NEXT_PUBLIC_SITE_URL.startsWith("https://")) throw new Error("NEXT_PUBLIC_SITE_URL must be https in production");
  }
  if (process.env.NODE_ENV === "production" && !isProd && c.DATABASE_URL) {
    throw new Error("APP_ENV=development/test cannot be combined with a real DATABASE_URL in a production build");
  }
  if (c.OIDC_ENABLED && !(c.OIDC_ISSUER && c.OIDC_CLIENT_ID && c.OIDC_REDIRECT_URI)) {
    throw new Error("OIDC_ENABLED requires OIDC_ISSUER, OIDC_CLIENT_ID and OIDC_REDIRECT_URI");
  }
  return {
    ...c,
    isProd,
    photoConcurrency: c.PHOTO_PROCESS_CONCURRENCY ?? Math.max(2, Math.min(8, os.availableParallelism())),
    auditSecret: c.AUDIT_HMAC_SECRET || DEV_ONLY_SECRET,
    dataKey: c.DATA_ENCRYPTION_KEY || DEV_ONLY_SECRET,
  };
}

let cached: AppConfig | undefined;
export function config(): AppConfig {
  return (cached ??= load());
}
/** Test hook: re-read process.env. */
export function resetConfigForTests() {
  cached = undefined;
}

export function whatsappConfigured(): boolean {
  const c = config();
  return c.WHATSAPP_ENABLED && !!(c.WHATSAPP_TOKEN && c.WHATSAPP_PHONE_NUMBER_ID && c.WHATSAPP_APP_SECRET);
}
