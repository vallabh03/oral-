import { existsSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { clipUrl, TUTORIAL_LANGS, TUTORIAL_STEPS, TUTORIAL_UI, VIEW_CLIP } from "@/lib/shared/tutorial";
import { REQUIRED_VIEWS } from "@/lib/shared/virtual";

describe("mouth-photo tutorial", () => {
  it("has narration, a title and on-screen labels in every language", () => {
    for (const s of TUTORIAL_STEPS) for (const l of TUTORIAL_LANGS) {
      expect(s.say[l.code].trim(), `${s.id}/${l.code}`).not.toBe("");
      expect(s.title[l.code].trim(), `${s.id}/${l.code}`).not.toBe("");
    }
    for (const [k, t] of Object.entries(TUTORIAL_UI)) for (const l of TUTORIAL_LANGS) expect(t[l.code].trim(), `${k}/${l.code}`).not.toBe("");
  });

  it("has a clip for every required photo, in the same order as the site", () => {
    expect(REQUIRED_VIEWS.map((v) => VIEW_CLIP[v])).toEqual(["lips", "cheek_left", "cheek_right", "tongue_top", "tongue_under"]);
  });

  it("never suggests the photos give a diagnosis", () => {
    const all = TUTORIAL_STEPS.flatMap((s) => [s.say.en, s.title.en]).join(" ").toLowerCase();
    for (const w of ["diagnos", "no cancer", "cancer-free", "rule out", "you have cancer"]) expect(all).not.toContain(w);
  });

  it("ships every rendered clip and the full guide", () => {
    for (const l of TUTORIAL_LANGS) for (const id of [...TUTORIAL_STEPS.map((s) => s.id), "full" as const]) {
      const file = join("public", clipUrl(l.code, id));
      expect(existsSync(file), file).toBe(true);
      expect(statSync(file).size, file).toBeGreaterThan(20_000);
    }
  });
});
