import { test as setup } from "@playwright/test";
import { statePath, uiLogin } from "./support";

for (const email of ["doctor@example.test", "superadmin@example.test", "assistant@example.test"]) {
  setup(`sign in ${email}`, async ({ page }) => {
    await uiLogin(page, email);
    await page.context().storageState({ path: statePath(email) });
  });
}
