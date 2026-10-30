import { expect, test } from "@playwright/test";
import { statePath } from "./support";

// Every screen must fit the device it is viewed on: small phones through very wide desktops.
const VIEWPORTS = [
  { name: "small phone", width: 320, height: 568 },
  { name: "standard phone", width: 375, height: 667 },
  { name: "phone", width: 390, height: 844 },
  { name: "large phone", width: 430, height: 932 },
  { name: "phone landscape", width: 844, height: 390 },
  { name: "tablet portrait", width: 768, height: 1024 },
  { name: "tablet landscape", width: 1024, height: 768 },
  { name: "wide tablet", width: 1180, height: 820 },
  { name: "laptop", width: 1366, height: 768 },
  { name: "desktop", width: 1440, height: 900 },
  { name: "large desktop", width: 1920, height: 1080 },
  { name: "ultrawide", width: 2560, height: 1440 },
];
const PUBLIC = ["/", "/know-oral-cancer", "/programs/drive-safe", "/camps", "/faq", "/contact", "/register", "/cookies"];
const STAFF = ["/workspace/admin", "/workspace/patients", "/workspace/patients/new"];

const overflow = (page: import("@playwright/test").Page) =>
  page.evaluate(() => {
    const w = document.documentElement.clientWidth;
    const offenders = [...document.querySelectorAll<HTMLElement>("body *")]
      .filter((el) => {
        const r = el.getBoundingClientRect();
        const style = getComputedStyle(el);
        return r.width > 0 && r.right > w + 1 && style.position !== "fixed" && !el.closest(".table-wrap, .ws-tabs, [hidden], .visually-hidden, .skip-link, dialog");
      })
      .slice(0, 5)
      .map((el) => `${el.tagName.toLowerCase()}.${el.className}`.slice(0, 80));
    return { scroll: document.documentElement.scrollWidth - w, offenders };
  });

test.describe("responsive layout — public site", () => {
  for (const vp of VIEWPORTS) {
    test(`fits ${vp.name} (${vp.width}×${vp.height})`, async ({ page }) => {
      await page.setViewportSize(vp);
      for (const path of PUBLIC) {
        await page.goto(path);
        const o = await overflow(page);
        expect(o, `${path} at ${vp.width}px`).toEqual({ scroll: 0, offenders: [] });
      }
      // Navigation adapts: full menu on wide screens, menu button on narrow ones.
      await page.goto("/");
      if (vp.width >= 1100) await expect(page.getByRole("navigation", { name: "Main" })).toBeVisible();
      else {
        const toggle = page.getByRole("button", { name: "Open menu" });
        await expect(toggle).toBeVisible();
        await toggle.click();
        await expect(page.getByRole("navigation", { name: "Mobile" })).toBeVisible();
        await page.keyboard.press("Escape");
        await expect(page.getByRole("navigation", { name: "Mobile" })).toBeHidden();
      }
    });
  }
});

test.describe("responsive layout — staff workspace", () => {
  test.use({ storageState: statePath("doctor@example.test") });
  for (const vp of VIEWPORTS) {
    test(`fits ${vp.name} (${vp.width}×${vp.height})`, async ({ page }) => {
      await page.setViewportSize(vp);
      for (const path of STAFF) {
        await page.goto(path);
        await page.waitForLoadState("networkidle");
        const o = await overflow(page);
        expect(o, `${path} at ${vp.width}px`).toEqual({ scroll: 0, offenders: [] });
      }
      await page.goto("/workspace/patients");
      await expect(page.locator(".patient-card").first()).toBeVisible();
      if (vp.width >= 1024) await expect(page.getByRole("complementary", { name: "Workspace" })).toBeVisible();
      else await expect(page.getByRole("navigation", { name: "Workspace sections (compact)" })).toBeVisible();
    });
  }
});
