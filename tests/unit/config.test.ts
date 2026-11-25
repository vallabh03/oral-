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

  it("treats LeminAi as a working channel, but only with its key and an https address", async () => {
    const lemin = { NOTIFY_DRIVER: "leminai", LEMINAI_API_KEY: "test-key", LEMINAI_BASE_URL: "https://lemin.example.test" };
    const ok = await loadProd(lemin);
    expect(ok.patientMessagingAvailable()).toBe(true);
    expect((await loadProd({ ...lemin, LEMINAI_API_KEY: "" })).config).toThrow(/LEMINAI_API_KEY/);
    expect((await loadProd({ ...lemin, LEMINAI_BASE_URL: "http://lemin.example.test" })).config).toThrow(/https/);
    // Unset in docker-compose arrives as an empty string and must not break other drivers.
    expect((await loadProd({ LEMINAI_API_KEY: "", LEMINAI_BASE_URL: "", VIRTUAL_SCREENING_WITHOUT_MESSAGING: "true" })).config().LEMINAI_BASE_URL).toBeUndefined();
  });

  it("can switch off login codes alone while messages still go out", async () => {
    const lemin = { NOTIFY_DRIVER: "leminai", LEMINAI_API_KEY: "test-key", LEMINAI_BASE_URL: "https://lemin.example.test" };
    const on = await loadProd(lemin);
    expect(on.loginCodesAvailable()).toBe(true);
    const off = await loadProd({ ...lemin, LOGIN_CODES_ENABLED: "false" });
    expect(off.patientMessagingAvailable()).toBe(true);
    expect(off.loginCodesAvailable()).toBe(false);
  });

  it("treats WhatsApp as a working channel", async () => {
    const { patientMessagingAvailable } = await loadProd({ NOTIFY_DRIVER: "whatsapp", WHATSAPP_TOKEN: "t", WHATSAPP_PHONE_NUMBER_ID: "1", WHATSAPP_APP_SECRET: "s" });
    expect(patientMessagingAvailable()).toBe(true);
  });
});
