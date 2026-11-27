import { describe, expect, it } from "vitest";
import { LANGUAGES } from "@/lib/shared/constants";
import { DRAFT_LANGUAGE_CODES, loadDictionary, parseEnabledLanguages, translator } from "@/lib/shared/i18n";
import { allParticipantStrings } from "@/lib/shared/i18n/scan";

const placeholders = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();

describe("participant translations", () => {
  const strings = allParticipantStrings();

  it("finds the participant texts", () => {
    expect(strings.length).toBeGreaterThan(100);
  });

  it("has a dictionary for every language offered except English", () => {
    expect([...DRAFT_LANGUAGE_CODES].sort()).toEqual(LANGUAGES.map((l) => l.code as string).filter((c) => c !== "en").sort());
  });

  for (const lang of DRAFT_LANGUAGE_CODES) {
    it(`${lang}: translates every participant text, keeps placeholders, has no leftovers`, async () => {
      const dict = (await loadDictionary(lang))!;
      const missing = strings.filter((s) => !dict[s]?.trim());
      expect(missing, `missing ${lang} translations`).toEqual([]);
      for (const s of strings) expect(placeholders(dict[s]!), `${lang}: ${s}`).toEqual(placeholders(s));
      const unused = Object.keys(dict).filter((k) => !strings.includes(k));
      expect(unused, `${lang} entries no longer used`).toEqual([]);
    });
  }

  it("falls back to English and fills placeholders", async () => {
    expect(translator(undefined)("Step {n} of {total}: {name}", { n: 1, total: 3, name: "Language" })).toBe("Step 1 of 3: Language");
    expect(translator(await loadDictionary("te"))("Back")).not.toBe("Back");
  });

  it("only switches on languages that have a dictionary", () => {
    expect(parseEnabledLanguages("")).toEqual([]);
    expect(parseEnabledLanguages(" te, xx ,en")).toEqual(["te"]);
    expect(parseEnabledLanguages("ALL")).toEqual(DRAFT_LANGUAGE_CODES);
  });
});
