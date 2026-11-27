// Participant-facing translations (registration, consent, questionnaire, completion).
// Dictionaries are keyed by the exact English text, so anything not translated falls back to
// English. Each language is loaded only when a participant chooses it.
//
// Two switches (server settings):
//   TRANSLATIONS_ENABLED     approved languages, shown as normal text (e.g. "te,hi,ur").
//   TRANSLATIONS_DRAFT_LIVE  unreviewed languages shown to participants as DRAFTS ("all" or a list):
//                            a notice says the English text applies, and every consent statement
//                            also shows the official English wording.
// Reviewers see every draft at /register?preview=translations.
// Stored data (answers, consent records, question snapshots) always stays in English.
import type { LanguageCode } from "../constants";

export type Dictionary = Record<string, string>;
type Loader = () => Promise<{ default: Dictionary }>;

export const DICTIONARY_LOADERS: Partial<Record<LanguageCode, Loader>> = {
  te: () => import("./te"),
  hi: () => import("./hi"),
  ur: () => import("./ur"),
  as: () => import("./as"),
  bn: () => import("./bn"),
  brx: () => import("./brx"),
  doi: () => import("./doi"),
  gu: () => import("./gu"),
  kn: () => import("./kn"),
  ks: () => import("./ks"),
  kok: () => import("./kok"),
  mai: () => import("./mai"),
  ml: () => import("./ml"),
  mni: () => import("./mni"),
  mr: () => import("./mr"),
  ne: () => import("./ne"),
  or: () => import("./or"),
  pa: () => import("./pa"),
  sa: () => import("./sa"),
  sat: () => import("./sat"),
  sd: () => import("./sd"),
  ta: () => import("./ta"),
};
export const DRAFT_LANGUAGE_CODES = Object.keys(DICTIONARY_LOADERS) as LanguageCode[];

export async function loadDictionary(lang: LanguageCode): Promise<Dictionary | undefined> {
  return (await DICTIONARY_LOADERS[lang]?.())?.default;
}

export type Translate = (english: string, vars?: Record<string, string | number>) => string;

export function translator(dict: Dictionary | undefined): Translate {
  return (english, vars) => {
    const text = dict?.[english] || english;
    return vars ? text.replace(/\{(\w+)\}/g, (_, k: string) => String(vars[k] ?? `{${k}}`)) : text;
  };
}

/** Parses a language list setting ("te,hi" or "all"): only languages that have a dictionary count. */
export function parseEnabledLanguages(value: string | undefined): LanguageCode[] {
  const v = (value ?? "").trim().toLowerCase();
  if (v === "all") return [...DRAFT_LANGUAGE_CODES];
  const wanted = new Set(v.split(",").map((s) => s.trim()).filter(Boolean));
  return DRAFT_LANGUAGE_CODES.filter((c) => wanted.has(c));
}
