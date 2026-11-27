import { describe, expect, it } from "vitest";
import { DRAFT_TRANSLATIONS, parseEnabledLanguages, translator } from "@/lib/shared/i18n";
import { allParticipantStrings } from "@/lib/shared/i18n/scan";

const placeholders = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();

describe("participant translations", () => {
  const strings = allParticipantStrings();

  it("finds the participant texts", () => {
    expect(strings.length).toBeGreaterThan(100);
  });

  for (const [lang, dict] of Object.entries(DRAFT_TRANSLATIONS)) {
    it(`${lang}: translates every participant text, keeps placeholders, has no leftovers`, () => {
      const missing = strings.filter((s) => !dict![s]?.trim());
      expect(missing, `missing ${lang} translations`).toEqual([]);
      for (const s of strings) expect(placeholders(dict![s]!), `${lang}: ${s}`).toEqual(placeholders(s));
      const unused = Object.keys(dict!).filter((k) => !strings.includes(k));
      expect(unused, `${lang} entries no longer used`).toEqual([]);
    });
  }

  it("falls back to English and fills placeholders", () => {
    expect(translator("en")("Step {n} of {total}: {name}", { n: 1, total: 3, name: "Language" })).toBe("Step 1 of 3: Language");
    expect(translator("ta")("Back")).toBe("Back"); // no Tamil dictionary yet
    expect(translator("te")("Back")).not.toBe("Back");
  });

  it("only switches on languages that have a dictionary", () => {
    expect(parseEnabledLanguages("")).toEqual([]);
    expect(parseEnabledLanguages(" te, xx ,ta")).toEqual(["te"]);
  });
});
