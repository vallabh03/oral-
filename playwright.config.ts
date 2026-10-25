import { defineConfig, devices } from "@playwright/test";

const PORT = 3100;
const env = { CLINICAL_IMAGES_ENABLED: "true", INDEXING_ENABLED: "true", APP_ENV: "test", PGLITE_DIR: ".data/e2e", STORAGE_DRIVER: "db", INTAKE_ENABLED: "true", EMAIL_DRIVER: "console", NEXT_TELEMETRY_DISABLED: "1" };
const fakeCamera = { launchOptions: { args: ["--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream"] }, permissions: ["camera"] };

// One synthetic database per run; staff sessions are created once in the setup project.
export default defineConfig({
  testDir: "tests/e2e",
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: [["list"], ["html", { open: "never", outputFolder: "playwright-report" }]],
  use: { baseURL: `http://localhost:${PORT}`, trace: "retain-on-failure", screenshot: "only-on-failure", ...fakeCamera },
  webServer: {
    command: `npx tsx --conditions=react-server scripts/e2e-prepare.ts && npx next start -p ${PORT}`,
    url: `http://localhost:${PORT}/api/health`,
    reuseExistingServer: false,
    timeout: 180_000,
    env,
  },
  projects: [
    { name: "setup", testMatch: /auth\.setup\.ts/ },
    { name: "desktop", use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 }, ...fakeCamera }, dependencies: ["setup"] },
    { name: "tablet", use: { ...devices["Desktop Chrome"], viewport: { width: 820, height: 1180 }, hasTouch: true, isMobile: false, ...fakeCamera }, dependencies: ["setup"], testIgnore: /staff-workflow|responsive|lesion-images/ },
    { name: "mobile", use: { ...devices["Pixel 7"], ...fakeCamera }, dependencies: ["setup"], testIgnore: /staff-workflow|responsive|lesion-images/ },
  ],
});
