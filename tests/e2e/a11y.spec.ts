import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { statePath } from "./support";

const scan = async (page: import("@playwright/test").Page) => {
  const r = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
  return r.violations.filter((v) => v.impact === "serious" || v.impact === "critical").map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).slice(0, 3).join(", ")}`);
};

test.describe("accessibility (axe, WCAG 2.1 AA — serious/critical)", () => {
  for (const scheme of ["light", "dark"] as const) {
    for (const path of ["/", "/know-oral-cancer", "/faq", "/contact", "/register", "/camps", "/workspace/login", "/this-is-a-404"]) {
      test(`${path} (${scheme})`, async ({ page }) => {
        await page.emulateMedia({ colorScheme: scheme });
        await page.goto(path);
        expect(await scan(page)).toEqual([]);
      });
    }
  }

  test.describe("staff workspace", () => {
    test.use({ storageState: statePath("doctor@example.test") });
    for (const path of ["/workspace/admin", "/workspace/patients", "/workspace/patients/new"]) {
      test(path, async ({ page }) => {
        await page.goto(path);
        await page.waitForLoadState("networkidle");
        expect(await scan(page)).toEqual([]);
      });
    }
  });
});
