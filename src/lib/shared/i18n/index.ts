// Participant-facing translations (registration, consent, questionnaire, completion).
// Dictionaries are keyed by the exact English text, so anything not yet translated falls back to
// English. Translations are DRAFTS until a native speaker and the programme approve them; they are
// only shown for languages listed in TRANSLATIONS_ENABLED (or on the ?preview=translations page).
// Stored data (answers, consent records, question snapshots) always stays in English codes/text.
import type { LanguageCode } from "../constants";
import te from "./te";
import hi from "./hi";
import ur from "./ur";

export type Dictionary = Record<string, string>;
export const DRAFT_TRANSLATIONS: Partial<Record<LanguageCode, Dictionary>> = { te, hi, ur };
export const DRAFT_LANGUAGE_CODES = Object.keys(DRAFT_TRANSLATIONS) as LanguageCode[];

export type Translate = (english: string, vars?: Record<string, string | number>) => string;

export function translator(lang: LanguageCode): Translate {
  const dict = DRAFT_TRANSLATIONS[lang];
  return (english, vars) => {
    const text = dict?.[english] || english;
    return vars ? text.replace(/\{(\w+)\}/g, (_, k: string) => String(vars[k] ?? `{${k}}`)) : text;
  };
}

/** Parses TRANSLATIONS_ENABLED ("te,hi,ur"): only languages that have a dictionary count. */
export function parseEnabledLanguages(value: string | undefined): LanguageCode[] {
  const wanted = new Set((value ?? "").split(",").map((s) => s.trim()).filter(Boolean));
  return DRAFT_LANGUAGE_CODES.filter((c) => wanted.has(c));
}
