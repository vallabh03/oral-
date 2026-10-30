import { afterEach, describe, expect, it, vi } from "vitest";

// Production rules are decided when the config module loads, so each case gets a fresh module.
async function loadProd(extra: Record<string, string>) {
  vi.resetModules();
  const env: Record<string, string> = {
    NODE_ENV: "production",
    APP_ENV: "production",
    NEXT_PUBLIC_SITE_URL: "https://example.org",
    DATABASE_URL: "postgres://app:pw@db/taoc",
    AUDIT_HMAC_SECRET: "a".repeat(40),
    DATA_ENCRYPTION_KEY: "b".repeat(40),
    STORAGE_DRIVER: "s3",
    S3_BUCKET: "photos-bucket",
    CLINICAL_S3_BUCKET: "clinical-bucket",
    CLINICAL_S3_KMS_KEY_ID: "arn:aws:kms:ap-south-1:1:key/x",
    NOTIFY_DRIVER: "console",
    VIRTUAL_SCREENING_ENABLED: "true",
    VIRTUAL_SCREENING_WITHOUT_MESSAGING: "",
    ...extra,
  };
  for (const [k, v] of Object.entries(env)) vi.stubEnv(k, v);
  const mod = await import("@/lib/server/config");
  return mod;
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe("production configuration guards for virtual screening", () => {
  it("refuses virtual screening without a delivery channel", async () => {
    const { config } = await loadProd({});
    expect(() => config()).toThrow(/NOTIFY_DRIVER=whatsapp/);
  });

  it("allows the no-messaging pilot only with the explicit override, and reports messaging as unavailable", async () => {
    const { config, patientMessagingAvailable } = await loadProd({ VIRTUAL_SCREENING_WITHOUT_MESSAGING: "true" });
    expect(config().VIRTUAL_SCREENING_ENABLED).toBe(true);
    expect(patientMessagingAvailable()).toBe(false);
  });

  it("treats WhatsApp as a working channel", async () => {
    const { patientMessagingAvailable } = await loadProd({ NOTIFY_DRIVER: "whatsapp", WHATSAPP_TOKEN: "t", WHATSAPP_PHONE_NUMBER_ID: "1", WHATSAPP_APP_SECRET: "s" });
    expect(patientMessagingAvailable()).toBe(true);
  });
});
