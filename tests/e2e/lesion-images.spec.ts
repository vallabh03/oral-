import { expect, test, type Page } from "@playwright/test";
import { statePath } from "./support";

// PRD v1.2 oral lesion image capture through the real clinician UI (synthetic participants).
test.describe("clinical lesion images", () => {
  test.use({ storageState: statePath("doctor@example.test") });

  async function openParticipant(page: Page, name: string) {
    await page.goto("/workspace/patients");
    await page.getByLabel(/^Search/).fill(name);
    await page.getByRole("button", { name: "Search", exact: true }).click();
    await expect(page.locator(".patient-card")).toHaveCount(1); // wait for the search result, not the recent list
    await expect(page.locator(".patient-card").first()).toContainText(name);
    await page.locator(".patient-card").first().click();
    await expect(page.getByRole("heading", { name, level: 1 })).toBeVisible();
  }

  async function recordLesionExam(page: Page) {
    const exam = page.locator("section[aria-labelledby='e-h']");
    await exam.getByLabel("Mouth opening", { exact: true }).selectOption("normal");
    await exam.getByLabel("Erythroplakia / red lesion").check();
    await exam.getByLabel("Tongue").check();
    await exam.getByLabel("Lesion present (for classification)").selectOption("yes");
    await exam.getByLabel("Clinical impression").selectOption("pmod");
    await exam.getByRole("button", { name: "Save draft" }).click();
    await expect(page.getByText("v1 draft", { exact: true })).toBeVisible();
  }

  test("consent granted → close-up captured with the camera → saved → viewable", async ({ page }) => {
    await openParticipant(page, "Venkatesh Rao");
    await recordLesionExam(page);
    const panel = page.locator("section[aria-labelledby='li-h']");
    await expect(panel.getByRole("status").filter({ hasText: "Photography consent not recorded" })).toBeVisible();

    await panel.getByRole("button", { name: "Ask for photography consent" }).click();
    await expect(panel.getByText(/close-up photographs being taken of the affected area/)).toBeVisible();
    await panel.getByLabel("Participant agrees").check();
    await expect(panel.getByRole("button", { name: "Save decision" })).toBeDisabled(); // face question must be answered
    await panel.getByLabel("Face must stay out of photo").check();
    await panel.getByRole("button", { name: "Save decision" }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Record decision" }).click();
    await expect(panel.getByRole("status").filter({ hasText: "Photography consented" })).toBeVisible();

    await panel.getByRole("button", { name: "Add lesion image" }).click();
    await expect(panel.getByLabel("Lesion site shown")).toHaveValue("tongue");
    await expect(panel.getByLabel(/Image includes facial features/)).toBeDisabled(); // face not consented
    await panel.getByRole("button", { name: "Open camera" }).click();
    await panel.getByRole("button", { name: "Take close-up photo" }).click();
    await expect(panel.getByRole("img", { name: /Captured photo of the affected area/ })).toBeVisible();
    await expect(panel.getByRole("button", { name: "Discard" })).toBeVisible(); // remove before save
    await panel.getByRole("button", { name: "Save image" }).click();
    await expect(panel.getByRole("list", { name: "Saved clinical images" }).getByRole("listitem")).toHaveCount(1);

    await panel.getByRole("button", { name: "View" }).click();
    const viewer = page.getByRole("dialog", { name: /Tongue/ });
    const img = viewer.getByRole("img", { name: /Clinical image of the tongue/ });
    await expect(img).toBeVisible();
    await expect.poll(() => img.evaluate((el: HTMLImageElement) => el.complete && el.naturalWidth)).toBeGreaterThan(0);
    await expect(viewer.getByText(/not a diagnosis/)).toBeVisible();
    await viewer.getByRole("button", { name: "Close" }).click();
  });

  test("consent declined → no capture, examination still verifies", async ({ page }) => {
    await openParticipant(page, "Srinivas Goud");
    await recordLesionExam(page);
    const panel = page.locator("section[aria-labelledby='li-h']");
    await panel.getByRole("button", { name: "Ask for photography consent" }).click();
    await panel.getByLabel("Participant declines").check();
    await panel.getByRole("button", { name: "Save decision" }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Record decision" }).click();
    await expect(panel.getByRole("status").filter({ hasText: "Photography declined" })).toBeVisible();
    await expect(panel.getByRole("button", { name: "Add lesion image" })).toHaveCount(0);

    await page.getByRole("button", { name: "Verify examination" }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Verify examination" }).click();
    await expect(page.getByText("v1 verified", { exact: true })).toBeVisible();
    await expect(page.locator(".group-badge")).toBeVisible();
  });
});

test.describe("clinical images are not shown to other roles", () => {
  test.use({ storageState: statePath("superadmin@example.test") });
  test("Super Admin sees the record but no clinical image panel or API access", async ({ page }) => {
    await page.goto("/workspace/patients");
    await page.locator(".patient-card").first().click();
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await expect(page.locator("section[aria-labelledby='li-h']")).toHaveCount(0);
    const id = page.url().split("/").pop()!;
    expect((await page.request.get(`/api/patients/${id}/lesion-images`)).status()).toBe(403);
  });
});
