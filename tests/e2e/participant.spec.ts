import { expect, test } from "@playwright/test";

test.describe("participant self-registration with photo capture", () => {
  test("register → consent → camera photo → questionnaire → status & QR", async ({ page }) => {
    await page.goto("/register");
    await expect(page.getByRole("heading", { name: "Choose a language" })).toBeVisible();
    await page.getByLabel("Preferred language").selectOption("te");
    await expect(page.getByText(/translation is not available yet/)).toBeVisible();
    await page.getByRole("button", { name: "Continue" }).click();

    // Inline validation and error summary
    await page.getByRole("button", { name: "Continue" }).click();
    await expect(page.locator(".error-summary")).toContainText("Please fix");

    await page.getByLabel(/Full name/).fill("Playwright Driver");
    await page.getByLabel(/Age in years/).fill("41");
    await page.getByLabel(/Mobile number/).fill(`9${Date.now().toString().slice(-9)}`);
    await page.getByLabel(/Driver type/).selectOption("auto");
    await page.getByLabel(/How did you hear/).selectOption("poster");
    await page.getByLabel("Contact preference").selectOption("whatsapp");
    await page.getByRole("button", { name: "Continue" }).click();

    await page.getByRole("button", { name: "Register" }).click();
    await expect(page.locator(".error-summary")).toContainText("required");
    await page.getByLabel(/I voluntarily agree to register/).check();
    await page.getByLabel(/does not replace a complete medical evaluation/).check();
    await page.getByLabel(/photo of my face/).check();
    await page.getByLabel(/contacted by the programme/).check();
    await page.getByRole("button", { name: "Register" }).click();

    await expect(page.getByText(/Your participant ID is/)).toBeVisible();
    const displayId = (await page.locator(".callout .code-chip").first().textContent())!.trim();
    expect(displayId).toMatch(/^HAOC-DS-\d{4}$/);

    // Fake camera stream (Chromium) → capture → upload with progress → saved
    await page.getByRole("button", { name: "Open camera" }).click();
    await expect(page.getByLabel(/Live camera preview/)).toBeVisible();
    await page.getByRole("button", { name: "Take photo" }).click(); // enabled only once frames arrive
    await expect(page.getByRole("img", { name: /Captured photo/ })).toBeVisible();
    await page.getByRole("button", { name: "Use this photo" }).click();

    await expect(page.getByRole("heading", { name: "Brief questionnaire" })).toBeVisible();
    await page.getByLabel("Gutkha / tobacco-containing pan masala").check();
    await page.getByLabel("More than 10 years").check();
    await page.getByLabel("More than 5 times a day").check();
    await page.getByLabel("None of these").check();
    await page.locator("#q-risk_awareness").getByLabel("Yes", { exact: true }).check();
    await page.locator("#q-sign_awareness").getByLabel("No", { exact: true }).check();
    await page.locator("#q-previous_screening").getByLabel("No", { exact: true }).check();
    await page.locator("#q-cessation_interest").getByLabel("Yes", { exact: true }).check();
    await page.getByRole("button", { name: "Submit answers" }).click();
    await expect(page.getByRole("heading", { name: /clinician screening pending/ })).toBeVisible();

    await page.getByRole("link", { name: /View my status/ }).click();
    await expect(page.getByRole("heading", { name: "Questionnaire completed — awaiting clinician" })).toBeVisible();
    await expect(page.getByRole("img", { name: "Your identity photo" })).toBeVisible();
    await page.getByRole("button", { name: "Show QR code" }).click();
    await expect(page.getByRole("img", { name: "Check-in QR code" })).toBeVisible();

    // Confirmation modal before an irreversible choice; cancelling keeps the photo.
    await page.getByRole("button", { name: "Withdraw" }).first().click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    await dialog.getByRole("button", { name: "Cancel" }).click();
    await expect(page.getByRole("img", { name: "Your identity photo" })).toBeVisible();
  });

  test("a resume link with an invalid token shows a safe message", async ({ page }) => {
    await page.goto("/register/resume#token=" + "x".repeat(43));
    await expect(page.getByText(/invalid or has expired/)).toBeVisible();
    expect(page.url()).not.toContain("token=");
  });
});
