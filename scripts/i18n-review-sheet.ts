// Side-by-side review sheet (CSV, opens in Excel/Google Sheets) for native-speaker reviewers.
// Usage: npx tsx scripts/i18n-review-sheet.ts out.csv te,hi,ur
import fs from "node:fs";
import { CONSENT_POLICIES, LANGUAGES, type LanguageCode } from "../src/lib/shared/constants";
import { PROTOCOL } from "../src/lib/shared/protocol";
import { loadDictionary, parseEnabledLanguages } from "../src/lib/shared/i18n";
import { PARTICIPANT_CONSENTS } from "../src/lib/shared/i18n/keys";
import { allParticipantStrings } from "../src/lib/shared/i18n/scan";

const [out, list = "te,hi,ur"] = process.argv.slice(2);
const langs = parseEnabledLanguages(list) as LanguageCode[];
const consents = new Set<string>(PARTICIPANT_CONSENTS.map((c) => CONSENT_POLICIES[c].text));
const questions = new Set<string>(PROTOCOL.questions.flatMap((q) => [q.text, ...q.options.map((o) => o.label)]));
const where = (s: string) => (consents.has(s) ? "1 CONSENT (legal - check word by word)" : questions.has(s) ? "2 Questionnaire" : "3 Screens & buttons");

const dicts = await Promise.all(langs.map(loadDictionary));
const name = (l: LanguageCode) => LANGUAGES.find((x) => x.code === l)!.name;
const rows = allParticipantStrings().map((s) => ({ s, w: where(s) })).sort((a, b) => a.w.localeCompare(b.w));
const cell = (v: string) => `"${v.replace(/"/g, '""')}"`;
const header = ["#", "Where", "English (original)", ...langs.flatMap((l) => [name(l), `${name(l)} OK? (Y/N)`, `${name(l)} correction`])];
const lines = [header.map(cell).join(",")];
rows.forEach(({ s, w }, i) => lines.push([String(i + 1), w, s, ...dicts.flatMap((d) => [d?.[s] ?? "", "", ""])].map(cell).join(",")));
fs.writeFileSync(out!, "﻿" + lines.join("\r\n"), "utf8");
console.log(`${rows.length} rows, ${langs.length} languages -> ${out}`);
