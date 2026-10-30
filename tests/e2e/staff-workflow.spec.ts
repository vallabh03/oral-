import { expect, test } from "@playwright/test";
import { statePath } from "./support";

test.describe("clinician workflow", () => {
  test.use({ storageState: statePath("doctor@example.test") });

  test("records load with photos; exam → verify (confirm) → category → report → print", async ({ page }) => {
    await page.goto("/workspace/patients");
    // The first record with a photo: a virtual participant registered by another spec has none.
    const firstCard = page.locator(".patient-card").filter({ has: page.locator("img") }).first();
    await expect(firstCard).toBeVisible();
    const thumb = firstCard.locator("img");
    await expect(thumb).toHaveAttribute("loading", "lazy");
    await expect.poll(() => thumb.evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth)).toBeGreaterThan(0);

    // Privacy screen blurs names/photos on shared displays
    await page.getByRole("button", { name: "Privacy screen" }).click();
    await expect(page.locator(".privacy-blur")).toHaveCount(1);
    await page.getByRole("button", { name: "Show details" }).click();

    // Exact-ID search
    const id = (await firstCard.locator(".code-chip").textContent())!.trim();
    await page.getByLabel(/^Search/).fill(id);
    await page.getByRole("button", { name: "Search", exact: true }).click();
    const result = page.locator(".patient-card").filter({ hasText: id });
    await expect(page.locator(".patient-card")).toHaveCount(1);
    await expect(result).toBeVisible();
    await result.click();
    await expect(page).toHaveURL(/\/workspace\/patients\/[0-9a-f-]{36}$/); // the list re-renders after the search; wait for the record itself

    await expect(page.getByRole("img", { name: /Identity photo of/ })).toBeVisible();
    await page.getByRole("button", { name: "Check in" }).click();
    await expect(page.getByRole("button", { name: "Checked in ✓" })).toBeVisible();

    const exam = page.getByRole("region", { name: /Oral examination/ }).or(page.locator("section[aria-labelledby='e-h']"));
    await exam.getByLabel("Mouth opening", { exact: true }).selectOption("normal");
    await exam.getByLabel("Leukoplakia / white lesion").check();
    await exam.getByLabel("Left buccal mucosa").check();
    await exam.getByLabel("Lesion present (for classification)").selectOption("yes");
    await exam.getByLabel("Clinical impression").selectOption("pmod");
    await exam.getByRole("button", { name: "Save draft" }).click();
    await expect(page.getByText("v1 draft", { exact: true })).toBeVisible();

    // A recorded lesion needs a photography decision before verification; this participant declines.
    const photos = page.locator("section[aria-labelledby='li-h']");
    await photos.getByRole("button", { name: "Ask for photography consent" }).click();
    await photos.getByLabel("Participant declines").check();
    await photos.getByRole("button", { name: "Save decision" }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Record decision" }).click();
    await expect(photos.getByRole("status").filter({ hasText: "Photography declined" })).toBeVisible();

    await page.getByRole("button", { name: "Verify examination" }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toContainText("locks this examination");
    await dialog.getByRole("button", { name: "Verify examination" }).click();
    await expect(page.getByText("v1 verified", { exact: true })).toBeVisible();
    await expect(page.locator(".group-badge")).toContainText(/Group [24]/);

    await page.getByRole("button", { name: "Generate report" }).click();
    await page.getByRole("link", { name: /Report v1/ }).click();
    await expect(page.getByRole("heading", { name: "Oral health screening report" })).toBeVisible();
    await expect(page.getByText(/not a diagnosis of cancer/)).toBeVisible();
    await page.emulateMedia({ media: "print" });
    await expect(page.getByRole("button", { name: /Print/ })).toBeHidden();
  });

  test("camp-assisted registration with staff photo capture", async ({ page }) => {
    await page.goto("/workspace/patients/new");
    await page.getByRole("button", { name: "Continue" }).click();
    await page.getByLabel(/Full name/).fill("Camp Assisted Person");
    await page.getByLabel(/Age in years/).fill("52");
    await page.getByLabel(/Driver type/).selectOption("cab_taxi");
    await page.getByLabel(/Screening camp/).selectOption({ index: 1 });
    await page.getByLabel(/How did the participant hear/).selectOption("association");
    await page.getByRole("button", { name: "Continue" }).click();
    await page.getByLabel(/I voluntarily agree to register/).check();
    await page.getByLabel(/does not replace a complete medical evaluation/).check();
    await page.getByLabel(/photo of my face/).check();
    await page.getByRole("button", { name: "Register participant" }).click();
    await expect(page.getByRole("heading", { name: /Registered as/ })).toBeVisible();
    await page.getByRole("button", { name: "Open camera" }).click();
    await page.getByRole("button", { name: "Take photo" }).click(); // enabled only once frames arrive
    await page.getByRole("button", { name: "Use this photo" }).click();
    await expect(page.getByText("Photo saved")).toBeVisible();
    await page.getByRole("link", { name: /Open record/ }).click();
    await expect(page).toHaveURL(/\/workspace\/patients\/[0-9a-f-]{36}$/, { timeout: 20_000 });
    await expect(page.getByRole("img", { name: /Identity photo of Camp Assisted Person/ })).toBeVisible();
  });
});

test.describe("role boundaries in the UI", () => {
  test.describe("assistant", () => {
    test.use({ storageState: statePath("assistant@example.test") });
    test("sees analytics only and is denied clinical pages", async ({ page }) => {
      await page.goto("/workspace/assistant");
      await expect(page.getByRole("heading", { name: "Programme analytics" })).toBeVisible();
      await expect(page.getByRole("link", { name: "Download de-identified CSV" })).toBeVisible();
      await page.goto("/workspace/patients");
      await expect(page).toHaveURL(/\/workspace\/forbidden/);
      const api = await page.request.get("/api/patients");
      expect(api.status()).toBe(403);
    });
  });
  test.describe("super admin", () => {
    test.use({ storageState: statePath("superadmin@example.test") });
    test("manages staff and sees audit integrity", async ({ page }) => {
      await page.goto("/workspace/super-admin");
      await expect(page.locator(".callout").filter({ hasText: "Audit trail integrity" })).toContainText("verified");
      await page.goto("/workspace/super-admin/users");
      await page.getByLabel("Work email").fill(`new.${Date.now()}@example.test`);
      await page.getByLabel("Display name").fill("New Staff Member");
      await page.getByLabel("Role", { exact: true }).selectOption("assistant");
      await page.getByRole("button", { name: "Create account" }).click();
      await expect(page.getByText("One-time setup link")).toBeVisible();
      await page.goto("/workspace/super-admin/audit");
      await expect(page.locator("table.data tbody tr").first()).toBeVisible();
    });
  });
  test("anonymous visitors are sent to sign-in", async ({ page }) => {
    await page.goto("/workspace/patients");
    await expect(page).toHaveURL(/\/workspace\/login/);
    const res = await page.request.get("/workspace/admin", { maxRedirects: 0 });
    expect([302, 303, 307, 308]).toContain(res.status());
    expect(res.headers()["x-robots-tag"]).toContain("noindex");
  });
});
