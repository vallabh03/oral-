// Starts the production build locally in a mode the k6 tests can use (works the same on Windows,
// macOS and Linux):  npm run build && npm run seed:dev && npm run test:load:server
//
// APP_ENV=development keeps local cookie names (ds_session) over plain http and opens participant
// intake; the synthetic database is the one `npm run seed:dev` created (.data/pglite by default).
// Set DISABLE_RATE_LIMITS=1 before running to measure raw capacity without the app's rate limits.
import { spawn } from "node:child_process";

const port = process.env.PORT || "3000";
const env = {
  NEXT_PUBLIC_SITE_URL: `http://localhost:${port}`,
  INTAKE_ENABLED: "true",
  VIRTUAL_SCREENING_ENABLED: "true",
  NOTIFY_DRIVER: "console",
  EMAIL_DRIVER: "console",
  STORAGE_DRIVER: "db",
  NEXT_TELEMETRY_DISABLED: "1",
  ...process.env,
  // Never production mode here, and never a real database.
  APP_ENV: process.env.DISABLE_RATE_LIMITS === "1" ? "test" : "development",
  DATABASE_URL: "",
};
console.log(`Starting the app for load tests on http://localhost:${port} (APP_ENV=${env.APP_ENV})`);
const child = spawn("npx", ["next", "start", "-p", port], { env, stdio: "inherit", shell: process.platform === "win32" });
child.on("exit", (code) => process.exit(code ?? 0));
