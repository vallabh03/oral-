import { expect, test, type Page } from "@playwright/test";
import sharp from "sharp";
import { statePath } from "./support";

// PRD addendum — remote registration with patient-captured photos, doctor review and the
// patient message, through the real UI. Synthetic participant and synthetic photos only.

const mouth = (bg: string) =>
  sharp(Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="900"><rect width="1200" height="900" fill="${bg}"/><ellipse cx="600" cy="450" rx="380" ry="230" fill="#b04a4a"/><ellipse cx="600" cy="450" rx="290" ry="140" fill="#e8a0a0"/><rect x="420" y="350" width="60" height="70" fill="#fff"/><rect x="560" y="350" width="60" height="70" fill="#fff"/><circle cx="680" cy="520" r="20" fill="#f4f4f4"/></svg>`)).jpeg({ quality: 88 }).toBuffer();

const REQUIRED = ["Front view", "Left-side view", "Right-side view", "Upper mouth view", "Lower mouth view"];
const name = `Virtual Driver ${Date.now().toString(36).replace(/\d/g, "x")}`;
const mobile = `9${Date.now().toString().slice(-9)}`;
let displayId = "";

async function registerVirtually(page: Page) {
  await page.goto("/register?mode=virtual");
  await expect(page.getByRole("heading", { name: "Register for virtual oral health screening" })).toBeVisible();
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByLabel(/Full name/).fill(name);
  await page.getByLabel(/Age in years/).fill("44");
  await page.getByLabel(/Mobile number/).fill(mobile);
  await page.getByLabel(/Driver type/).selectOption("app_cab");
  await page.getByLabel(/How did you hear/).selectOption("whatsapp");
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.locator(".error-summary")).toContainText("Please fix"); // district + PIN are required
  await page.getByLabel(/District/).selectOption("Hyderabad");
  await page.getByLabel(/PIN code/).fill("500016");
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByLabel(/I voluntarily agree to register/).check();
  await page.getByLabel(/does not replace a complete medical evaluation/).check();
  await page.getByRole("button", { name: "Register" }).click();
  await expect(page.locator(".error-summary")).toContainText("needed to send your mouth photos");
  await page.getByLabel(/photographs of the inside of my mouth/).check();
  await page.getByLabel(/messages about my screening review/).check();
  await page.getByRole("button", { name: "Register" }).click();
  displayId = (await page.locator(".callout .code-chip").first().textContent())!.trim();

  await expect(page.getByRole("heading", { name: "Brief questionnaire" })).toBeVisible();
  await page.getByLabel("None", { exact: true }).check();
  await page.locator("#q-symptoms").getByLabel("None of these").check();
  await page.locator("#q-alcohol").getByLabel("No", { exact: true }).check();
  await page.locator("#q-medical_history").getByLabel("None of these").check();
  await page.locator("#q-risk_awareness").getByLabel("Yes", { exact: true }).check();
  await page.locator("#q-sign_awareness").getByLabel("Yes", { exact: true }).check();
  await page.locator("#q-previous_screening").getByLabel("No", { exact: true }).check();
  await page.getByRole("button", { name: "Submit answers" }).click();
}

test.describe.serial("virtual screening with patient-captured photos", () => {
  test("participant registers remotely, photographs each area, fixes a dark photo and submits", async ({ page }) => {
    await registerVirtually(page);
    await expect(page.getByRole("heading", { name: "Photos of your mouth" })).toBeVisible();

    // The 45-second guide must play to the end before photo capture opens. The test browser has no
    // MP4 decoder, so a 3-second WebM stands in for the guide; the gate logic is the same.
    await page.route("**/tutorial/*/guide.mp4", (r) => r.fulfill({ path: "tests/fixtures/guide-3s.webm", contentType: "video/webm" }));
    const gate = page.locator(".tut-gate");
    await gate.getByRole("button", { name: "हिन्दी" }).click();
    const startPhotos = gate.getByRole("button", { name: "Start taking photos" });
    await expect(startPhotos).toBeDisabled();
    await expect(page.getByRole("button", { name: /Take photo/ })).toHaveCount(0);
    await expect(gate.getByRole("button", { name: "Skip video" })).toBeEnabled(); // the guide is optional
    const guide = gate.locator("video");
    await expect(guide).toHaveAttribute("src", "/tutorial/hi/guide.mp4");
    await expect.poll(() => guide.evaluate((v: HTMLVideoElement) => v.readyState)).toBeGreaterThan(0);
    // Skipping ahead does not count: the player returns to the last watched point.
    await guide.evaluate((v: HTMLVideoElement) => { v.currentTime = 2.8; });
    await expect.poll(() => guide.evaluate((v: HTMLVideoElement) => v.currentTime)).toBeLessThan(0.5);
    await expect(startPhotos).toBeDisabled();
    await guide.evaluate((v: HTMLVideoElement) => { v.muted = true; return v.play(); });
    await expect(startPhotos).toBeEnabled({ timeout: 15_000 });
    await expect(gate.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "100");
    await startPhotos.click();

    const submit = page.getByRole("button", { name: "Submit for doctor review" });
    await expect(submit).toBeDisabled();

    // Each required photo has a short narrated clip; the language choice applies to every clip.
    const first = page.locator(".vp-card").first();
    await first.getByRole("button", { name: /Watch how/ }).click();
    await first.getByRole("button", { name: "తెలుగు" }).click();
    await expect(first.locator("video")).toHaveAttribute("src", "/tutorial/te/lips.mp4");
    expect((await page.request.get("/tutorial/te/lips.mp4")).status()).toBe(200);

    const good = await mouth("#d9b8a0");
    const dark = await sharp(good).linear(0.1, 0).jpeg().toBuffer();
    for (const [i, view] of REQUIRED.entries()) {
      const card = page.locator(".vp-card").filter({ has: page.getByRole("heading", { name: new RegExp(view) }) });
      await card.locator("label", { hasText: "Choose from gallery" }).locator("input").setInputFiles({ name: `${i}.jpg`, mimeType: "image/jpeg", buffer: i === 0 ? dark : good });
      if (i === 0) {
        // The on-device check warns about a dark photo before anything is uploaded.
        await expect(card.getByText(/looks too dark/)).toBeVisible();
        await card.getByRole("button", { name: "Retake" }).click();
        await card.locator("label", { hasText: "Choose from gallery" }).locator("input").setInputFiles({ name: "0b.jpg", mimeType: "image/jpeg", buffer: good });
      }
      await card.getByRole("button", { name: "Save photo" }).click();
      await expect(card.getByText("Added ✓")).toBeVisible();
    }
    await expect(page.getByText("5 of 5")).toBeVisible();
    await submit.click();
    const finalMessage = "Thank you for registering with DRIVE SAFE. Your photographs have been submitted for doctor review. If further assessment is needed, the healthcare team may contact you.";
    await expect(page.getByRole("heading", { name: "Submitted for doctor review" })).toBeVisible();
    await expect(page.getByText(finalMessage)).toBeVisible();
    // The progress page shows the review status and the timeline.
    await page.getByRole("link", { name: "View my progress" }).click();
    await expect(page.getByRole("heading", { name: "Pending Review" })).toBeVisible();
    await expect(page.getByText(finalMessage)).toBeVisible();
    const timeline = page.getByRole("region", { name: "Your progress" });
    for (const step of ["Tutorial Completed", "Five Photos Captured", "Photo Upload Completed", "Submitted for Doctor Review"]) {
      await expect(timeline.locator("li.is-done", { hasText: step })).toBeVisible();
    }
  });

  test.describe("doctor", () => {
    test.use({ storageState: statePath("doctor@example.test") });
    test("reviews every photo directly, records the outcome and the participant message is sent", async ({ page }) => {
      await page.goto("/workspace/virtual");
      const card = page.locator(".vq-card").filter({ hasText: displayId });
      await expect(card).toBeVisible();
      await expect(card.locator(".vq-thumbs img")).toHaveCount(4);
      await card.click();
      await expect(page.getByRole("heading", { name, level: 1 })).toBeVisible();
      await expect(page.locator(".vr-img")).toHaveCount(5);
      await expect(page.getByText("Hyderabad")).toBeVisible();

      // Full-size image opens in a zoomable viewer.
      await page.getByRole("button", { name: /Open full-size photo: Front view/ }).click();
      await expect(page.getByRole("dialog").getByRole("img", { name: /Front view — full size/ })).toBeVisible();
      await page.getByRole("dialog").getByRole("button", { name: "Close" }).click();

      for (let i = 0; i < 5; i++) {
        await page.locator(".vr-img").nth(i).getByRole("button", { name: "✓ Acceptable" }).click();
        await expect(page.locator(".vr-img").nth(i).getByText("Acceptable", { exact: true })).toBeVisible();
      }
      await page.getByLabel("No visible suspicious lesion in the submitted images").check();
      await page.getByLabel("Recommended next steps").fill("Routine check in 12 months");
      await page.getByRole("button", { name: "Record review" }).click();
      await expect(page.getByRole("dialog")).toContainText("No suspicious lesion was identified");
      await page.getByRole("dialog").getByRole("button", { name: "Record review" }).click();
      await expect(page.locator("section[aria-labelledby='out-h']")).toContainText("No visible suspicious lesion");
      const messages = page.locator("section[aria-labelledby='msg-h']");
      await expect(messages).toContainText("No suspicious lesion seen");
      await expect(messages).toContainText("Submission received");
    });
  });

  test("participant logs back in with a WhatsApp code and sees the result", async ({ page }) => {
    await page.goto("/register/login");
    await page.getByLabel("Participant ID").fill(displayId);
    await page.getByLabel("Mobile number").fill(mobile);
    await page.getByRole("button", { name: "Send code on WhatsApp" }).click();
    const code = (await page.locator(".callout .code-chip").textContent())!.trim(); // test mode shows the code
    await page.getByLabel("6-digit code").fill(code);
    await page.getByRole("button", { name: "Log in" }).click();
    await expect(page).toHaveURL(/\/register\/photos/);
    await expect(page.getByRole("heading", { name: "Reviewed" })).toBeVisible();
    await expect(page.getByText(/No suspicious lesion was identified in the images provided/)).toBeVisible();
    await expect(page.getByText(/Routine check/)).toHaveCount(0); // doctor's notes are never shown to the participant
  });
});
