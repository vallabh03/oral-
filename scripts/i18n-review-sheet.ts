// Side-by-side review sheet (CSV, opens in Excel/Google Sheets).
import fs from "node:fs";
import { CONSENT_POLICIES } from "../src/lib/shared/constants";
import { PROTOCOL } from "../src/lib/shared/protocol";
import { DRAFT_TRANSLATIONS } from "../src/lib/shared/i18n";
import { PARTICIPANT_CONSENTS } from "../src/lib/shared/i18n/keys";
import { allParticipantStrings } from "../src/lib/shared/i18n/scan";

const consents = new Set<string>(PARTICIPANT_CONSENTS.map((c) => CONSENT_POLICIES[c].text));
const questions = new Set<string>(PROTOCOL.questions.flatMap((q) => [q.text, ...q.options.map((o) => o.label)]));
const where = (s: string) => (consents.has(s) ? "1 CONSENT (legal - check word by word)" : questions.has(s) ? "2 Questionnaire" : "3 Screens & buttons");

const rows = allParticipantStrings().map((s) => ({ s, w: where(s) })).sort((a, b) => a.w.localeCompare(b.w));
const cell = (v: string) => `"${v.replace(/"/g, '""')}"`;
const langs = ["te", "hi", "ur"] as const;
const header = ["#", "Where", "English (original)", "Telugu", "Telugu OK? (Y/N)", "Telugu correction", "Hindi", "Hindi OK? (Y/N)", "Hindi correction", "Urdu", "Urdu OK? (Y/N)", "Urdu correction"];
const lines = [header.map(cell).join(",")];
rows.forEach(({ s, w }, i) => {
  const cols = [String(i + 1), w, s, ...langs.flatMap((l) => [DRAFT_TRANSLATIONS[l]?.[s] ?? "", "", ""])];
  lines.push(cols.map(cell).join(","));
});
fs.writeFileSync(process.argv[2]!, "﻿" + lines.join("\r\n"), "utf8");
console.log(`${rows.length} rows -> ${process.argv[2]}`);
