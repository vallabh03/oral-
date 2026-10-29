import { afterEach, describe, expect, it } from "vitest";
import { galleryEnabled } from "@/content/gallery";

describe("gallery switch", () => {
  afterEach(() => { delete process.env.GALLERY_ENABLED; });

  it("is off unless GALLERY_ENABLED is exactly true", () => {
    expect(galleryEnabled()).toBe(false);
    process.env.GALLERY_ENABLED = "yes";
    expect(galleryEnabled()).toBe(false);
    process.env.GALLERY_ENABLED = "true";
    expect(galleryEnabled()).toBe(true);
  });
});
