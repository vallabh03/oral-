import { existsSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { clipUrl, GUIDE_SCENES, GUIDE_SECONDS, TUTORIAL_LANGS, TUTORIAL_UI, VIEW_CLIP, VIEW_CLIPS } from "@/lib/shared/tutorial";
import { RECOMMENDED_VIEWS } from "@/lib/shared/virtual";

/** Duration of an MP4 file from its movie header (mvhd), in seconds. */
function mp4Seconds(file: string): number {
  const b = readFileSync(file);
  const i = b.indexOf("mvhd");
  const v1 = b[i + 4] === 1;
  const scale = b.readUInt32BE(i + (v1 ? 24 : 16));
  const duration = v1 ? Number(b.readBigUInt64BE(i + 28)) : b.readUInt32BE(i + 20);
  return duration / scale;
}

describe("mouth-photo tutorial", () => {
  it("has narration, a title and on-screen labels in every language", () => {
    for (const s of [...GUIDE_SCENES, ...VIEW_CLIPS]) for (const l of TUTORIAL_LANGS) {
      expect(s.say[l.code].trim(), `${s.id}/${l.code}`).not.toBe("");
      expect(s.title[l.code].trim(), `${s.id}/${l.code}`).not.toBe("");
    }
    for (const [k, t] of Object.entries(TUTORIAL_UI)) for (const l of TUTORIAL_LANGS) expect(t[l.code].trim(), `${k}/${l.code}`).not.toBe("");
  });

  it("walks through the five required photos in the same order as the site", () => {
    expect(GUIDE_SCENES.filter((s) => s.scene === "photo").map((s) => s.view)).toEqual(RECOMMENDED_VIEWS);
    expect(RECOMMENDED_VIEWS.map((v) => VIEW_CLIP[v])).toEqual(["lips", "cheek_left", "cheek_right", "upper_mouth", "lower_mouth"]);
  });

  it("never suggests the photos give a diagnosis", () => {
    const all = [...GUIDE_SCENES, ...VIEW_CLIPS].flatMap((s) => [s.say.en, s.title.en]).join(" ").toLowerCase();
    for (const w of ["diagnos", "no cancer", "cancer-free", "rule out", "you have cancer"]) expect(all).not.toContain(w);
  });

  it("ships a 45-second guide and every photo clip in each language", () => {
    for (const l of TUTORIAL_LANGS) {
      const guide = join("public", clipUrl(l.code, "guide"));
      expect(existsSync(guide), guide).toBe(true);
      expect(Math.abs(mp4Seconds(guide) - GUIDE_SECONDS), guide).toBeLessThan(0.6);
      for (const v of RECOMMENDED_VIEWS) {
        const file = join("public", clipUrl(l.code, VIEW_CLIP[v]!));
        expect(existsSync(file), file).toBe(true);
        expect(statSync(file).size, file).toBeGreaterThan(20_000);
      }
    }
  });
});
