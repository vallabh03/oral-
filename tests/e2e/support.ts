import fs from "node:fs";
import type { Page } from "@playwright/test";
import { totp } from "../../src/lib/server/security/totp";

type Creds = { users: { email: string; password: string; totpSecret: string; role: string }[] };
export const creds = (): Creds => JSON.parse(fs.readFileSync(".e2e-credentials.json", "utf8"));
export const account = (email: string) => creds().users.find((u) => u.email === email)!;
export const statePath = (email: string) => `test-results/.auth-${email.replace(/[^a-z]/g, "_")}.json`;

/** Signs in through the real UI (password, visibility toggle, MFA step). */
export async function uiLogin(page: Page, email: string) {
  const u = account(email);
  await page.goto("/workspace/login");
  await page.getByLabel("Work email").fill(u.email);
  await page.getByLabel("Password", { exact: true }).fill(u.password);
  await page.getByRole("button", { name: "Show password" }).click();
  await page.getByRole("button", { name: "Hide password" }).click();
  await page.getByRole("button", { name: "Sign in" }).click();
  const code = page.getByLabel("6-digit code");
  await code.waitFor();
  // Never reuse a TOTP step (replay protection): wait for a fresh window if one was just used.
  const step = Math.floor(Date.now() / 30_000);
  const lastFile = `test-results/.last-totp-${email.replace(/[^a-z]/g, "_")}`;
  const last = fs.existsSync(lastFile) ? Number(fs.readFileSync(lastFile, "utf8")) : -1;
  if (last >= step) await page.waitForTimeout((step + 1) * 30_000 - Date.now() + 500);
  fs.mkdirSync("test-results", { recursive: true });
  fs.writeFileSync(lastFile, String(Math.floor(Date.now() / 30_000)));
  await code.fill(totp(u.totpSecret));
  await page.getByRole("button", { name: "Verify and continue" }).click();
  await page.waitForURL(/\/workspace\/(admin|super-admin|assistant)/);
}
