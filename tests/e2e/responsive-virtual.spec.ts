import { expect, test, type Page } from "@playwright/test";
import { statePath } from "./support";
import { addPhoto, mouthPhoto, passTutorialGate, registerVirtually, syntheticIdentity } from "./virtual-flow";

// Cross-device acceptance for the virtual-screening journey and the doctor's review screens at the
// representative viewports of the requirements (small phones to large desktops, both orientations).
// Checks: nothing overflows sideways, nothing fixed or modal leaves the screen, every control is a
// comfortable touch target, and no page logs console errors or failed requests.
const VIEWPORTS = [
  { name: "small mobile", width: 320, height: 568 },
  { name: "standard mobile", width: 375, height: 667 },
  { name: "modern iPhone", width: 390, height: 844 },
  { name: "large mobile", width: 430, height: 932 },
  { name: "phone landscape", width: 844, height: 390 },
  { name: "tablet portrait", width: 768, height: 1024 },
  { name: "tablet landscape", width: 1024, height: 768 },
  { name: "laptop", width: 1366, height: 768 },
  { name: "desktop", width: 1440, height: 900 },
  { name: "large desktop", width: 1920, height: 1080 },
];
const MIN_TARGET = 40; // px; every button, field and tappable card control

type Report = { scroll: number; offenders: string[]; smallTargets: string[]; outOfView: string[] };
const describe = (el: Element) => `${el.tagName.toLowerCase()}${el.id ? `#${el.id}` : ""}.${(el as HTMLElement).className?.toString().replace(/\s+/g, ".")} “${(el.textContent ?? "").trim().slice(0, 30)}”`;

async function inspect(page: Page): Promise<Report> {
  return page.evaluate(({ min }) => {
    const w = document.documentElement.clientWidth;
    const h = window.innerHeight;
    const visible = (el: HTMLElement) => {
      const r = el.getBoundingClientRect();
      const s = getComputedStyle(el);
      return r.width > 0 && r.height > 0 && s.visibility !== "hidden" && s.display !== "none";
    };
    const desc = (el: Element) => `${el.tagName.toLowerCase()}${el.id ? `#${el.id}` : ""}.${(el as HTMLElement).className?.toString().replace(/\s+/g, ".")} “${(el.textContent ?? "").trim().slice(0, 30)}”`;
    const all = [...document.querySelectorAll<HTMLElement>("body *")];
    const offenders = all
      .filter((el) => visible(el) && el.getBoundingClientRect().right > w + 1 && getComputedStyle(el).position !== "fixed" && !el.closest(".table-wrap, .ws-tabs, [hidden], .visually-hidden, .skip-link, dialog, video"))
      .slice(0, 5).map(desc);
    const controls = [...document.querySelectorAll<HTMLElement>("button, a.btn, .vp-file, label.choice, select, textarea, input:not([type=hidden]):not([type=radio]):not([type=checkbox]):not([type=file])")];
    const smallTargets = controls
      .filter((el) => visible(el) && !el.closest("[hidden], dialog, .toast, video, .tut-gate .progress-bar"))
      .filter((el) => { const r = el.getBoundingClientRect(); return r.height < min || r.width < min; })
      .slice(0, 8).map(desc);
    const fixedOrModal = [...document.querySelectorAll<HTMLElement>("dialog[open], .floating-contact, .back-to-top, .toast-region, .mobile-nav")];
    const outOfView = fixedOrModal
      .filter((el) => visible(el))
      .filter((el) => { const r = el.getBoundingClientRect(); return r.left < -1 || r.top < -1 || r.right > w + 1 || r.bottom > h + 1; })
      .map(desc);
    return { scroll: document.documentElement.scrollWidth - w, offenders, smallTargets, outOfView };
  }, { min: MIN_TARGET });
}

function watchConsole(page: Page) {
  const problems: string[] = [];
  page.on("console", (m) => { if (m.type() === "error") problems.push(`console: ${m.text().slice(0, 160)}`); });
  page.on("response", (r) => { if (r.status() >= 500) problems.push(`${r.status()} ${r.url()}`); });
  return problems;
}

test.describe.serial("cross-device: virtual screening journey and doctor review", () => {
  let id = syntheticIdentity();
  let caseId = "";

  test("participant pages fit every viewport, with comfortable touch targets", async ({ page }) => {
    test.setTimeout(300_000); // ten viewports × four pages
    id = syntheticIdentity(); // fresh on every attempt: the duplicate check would refuse a re-registration
    const problems = watchConsole(page);
    await page.setViewportSize({ width: 390, height: 844 });
    await registerVirtually(page, id);
    await passTutorialGate(page);
    await addPhoto(page, "Front view", await mouthPhoto()); // one clear photo is enough to submit

    for (const vp of VIEWPORTS) {
      await page.setViewportSize(vp);
      for (const path of ["/register/photos", "/register/status", "/register/login", "/register?mode=virtual"]) {
        await page.goto(path);
        await page.waitForLoadState("networkidle");
        const r = await inspect(page);
        expect(r, `${path} at ${vp.name} ${vp.width}×${vp.height}`).toEqual({ scroll: 0, offenders: [], smallTargets: [], outOfView: [] });
      }
    }
    // Submit from a small phone, where the action bar is most likely to misbehave.
    await page.setViewportSize({ width: 320, height: 568 });
    await page.goto("/register/photos");
    await page.getByRole("button", { name: "Submit for doctor review" }).click();
    await expect(page.getByRole("heading", { name: "Pending Review" })).toBeVisible(); // the photos page shows the review status
    expect((await inspect(page)).scroll).toBe(0);
    expect(problems).toEqual([]);
  });

  test("doctor queue, case review, zoom and patient record fit every viewport", async ({ browser }) => {
    test.setTimeout(300_000); // ten viewports × four screens, each with a full-size photo viewer
    const ctx = await browser.newContext({ storageState: statePath("doctor@example.test") });
    const page = await ctx.newPage();
    const problems = watchConsole(page);
    await page.goto("/workspace/virtual");
    const card = page.locator(".vq-card").filter({ hasText: id.name });
    await expect(card).toBeVisible();
    await card.click();
    await expect(page.getByRole("heading", { name: id.name, level: 1 })).toBeVisible();
    caseId = page.url().split("/").pop()!;
    // The participant's record page, found the way staff find it.
    await page.goto("/workspace/patients");
    await page.getByLabel(/^Search/).fill(id.name);
    await page.getByRole("button", { name: "Search", exact: true }).click();
    await expect(page.locator(".patient-card")).toHaveCount(1);
    await page.locator(".patient-card").first().click();
    await expect(page.getByRole("heading", { name: id.name, level: 1 })).toBeVisible();
    const patientLink = new URL(page.url()).pathname;

    for (const vp of VIEWPORTS) {
      await page.setViewportSize(vp);
      const paths = ["/workspace/virtual", `/workspace/virtual/${caseId}`, patientLink];
      for (const path of paths) {
        await page.goto(path);
        await page.waitForLoadState("networkidle");
        const r = await inspect(page);
        expect(r, `${path} at ${vp.name} ${vp.width}×${vp.height}`).toEqual({ scroll: 0, offenders: [], smallTargets: [], outOfView: [] });
      }
      // The full-size photo viewer must stay inside the screen and close by touch/keyboard.
      await page.goto(`/workspace/virtual/${caseId}`);
      await page.getByRole("button", { name: /Open full-size photo: Front view/ }).click();
      const dialog = page.getByRole("dialog");
      await expect(dialog.getByRole("img", { name: /full size/ })).toBeVisible();
      const box = (await dialog.boundingBox())!;
      expect(box.x, `zoom dialog left at ${vp.name}`).toBeGreaterThanOrEqual(-1);
      expect(box.y, `zoom dialog top at ${vp.name}`).toBeGreaterThanOrEqual(-1);
      expect(box.x + box.width, `zoom dialog right at ${vp.name}`).toBeLessThanOrEqual(vp.width + 1);
      expect(box.y + box.height, `zoom dialog bottom at ${vp.name}`).toBeLessThanOrEqual(vp.height + 1);
      await page.keyboard.press("Escape");
      await expect(dialog).toBeHidden();
    }
    expect(problems).toEqual([]);
    await ctx.close();
  });
});
