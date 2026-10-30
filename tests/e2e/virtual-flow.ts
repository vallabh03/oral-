import { expect, type Page } from "@playwright/test";
import sharp from "sharp";

// Shared steps for driving the virtual-screening journey through the real UI (synthetic data only).

export const mouthPhoto = (bg = "#d9b8a0") =>
  sharp(Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="900"><rect width="1200" height="900" fill="${bg}"/><ellipse cx="600" cy="450" rx="380" ry="230" fill="#b04a4a"/><ellipse cx="600" cy="450" rx="290" ry="140" fill="#e8a0a0"/><rect x="420" y="350" width="60" height="70" fill="#fff"/><rect x="560" y="350" width="60" height="70" fill="#fff"/><circle cx="680" cy="520" r="20" fill="#f4f4f4"/></svg>`)).jpeg({ quality: 88 }).toBuffer();

export const syntheticIdentity = () => ({
  name: `Virtual Driver ${Date.now().toString(36).replace(/\d/g, "x")}`,
  mobile: `9${Date.now().toString().slice(-9)}`,
});

/** Registers a virtual participant and answers the questionnaire. Returns the participant ID. */
export async function registerVirtually(page: Page, id: { name: string; mobile: string }): Promise<string> {
  await page.goto("/register?mode=virtual");
  await expect(page.getByRole("heading", { name: "Register for virtual oral health screening" })).toBeVisible();
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByLabel(/Full name/).fill(id.name);
  await page.getByLabel(/Age in years/).fill("44");
  await page.getByLabel(/Mobile number/).fill(id.mobile);
  await page.getByLabel(/Driver type/).selectOption("app_cab");
  await page.getByLabel(/How did you hear/).selectOption("whatsapp");
  await page.getByLabel(/District/).selectOption("Hyderabad");
  await page.getByLabel(/PIN code/).fill("500016");
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByLabel(/I voluntarily agree to register/).check();
  await page.getByLabel(/does not replace a complete medical evaluation/).check();
  await page.getByLabel(/photographs of the inside of my mouth/).check();
  await page.getByLabel(/messages about my screening review/).check();
  await page.getByRole("button", { name: "Register" }).click();
  const displayId = (await page.locator(".callout .code-chip").first().textContent())!.trim();

  await expect(page.getByRole("heading", { name: "Brief questionnaire" })).toBeVisible();
  await page.getByLabel("None", { exact: true }).check();
  await page.locator("#q-symptoms").getByLabel("None of these").check();
  await page.locator("#q-alcohol").getByLabel("No", { exact: true }).check();
  await page.locator("#q-medical_history").getByLabel("None of these").check();
  await page.locator("#q-risk_awareness").getByLabel("Yes", { exact: true }).check();
  await page.locator("#q-sign_awareness").getByLabel("Yes", { exact: true }).check();
  await page.locator("#q-previous_screening").getByLabel("No", { exact: true }).check();
  await page.getByRole("button", { name: "Submit answers" }).click();
  await expect(page.getByRole("heading", { name: "Photos of your mouth" })).toBeVisible();
  return displayId;
}

/** Watches the (stubbed, 3-second) guide to the end so photo capture opens. */
export async function passTutorialGate(page: Page) {
  await page.route("**/tutorial/*/guide.mp4", (r) => r.fulfill({ path: "tests/fixtures/guide-3s.webm", contentType: "video/webm" }));
  const gate = page.locator(".tut-gate");
  const startPhotos = gate.getByRole("button", { name: "Start taking photos" });
  const guide = gate.locator("video");
  // Switching language sets a fresh video source, so the stub (not the real, undecodable MP4) is what loads.
  await gate.getByRole("button", { name: "తెలుగు" }).click();
  await expect(guide).toHaveAttribute("src", "/tutorial/te/guide.mp4");
  await expect.poll(() => guide.evaluate((v: HTMLVideoElement) => v.readyState)).toBeGreaterThan(0);
  await guide.evaluate((v: HTMLVideoElement) => { v.muted = true; return v.play(); });
  await expect(startPhotos).toBeEnabled({ timeout: 30_000 });
  await startPhotos.click();
}

/** Adds a photo for the named view through the gallery picker and saves it. */
export async function addPhoto(page: Page, viewLabel: string, buffer: Buffer) {
  const card = page.locator(".vp-card").filter({ has: page.getByRole("heading", { name: new RegExp(viewLabel) }) });
  await card.locator("label", { hasText: "Choose from gallery" }).locator("input").setInputFiles({ name: "p.jpg", mimeType: "image/jpeg", buffer });
  await card.getByRole("button", { name: "Save photo" }).click();
  await expect(card.getByText("Added ✓")).toBeVisible();
}
