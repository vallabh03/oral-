// Node-only helper (tests and the review-sheet script): every English text that needs a translation.
import fs from "node:fs";
import { dataStrings, TRANSLATED_COMPONENTS } from "./keys";

const LITERAL = /\bt\("((?:[^"\\]|\\.)*)"/g;

export function allParticipantStrings(root = "."): string[] {
  const lit = new Set<string>();
  for (const f of TRANSLATED_COMPONENTS) {
    for (const m of fs.readFileSync(`${root}/${f}`, "utf8").matchAll(LITERAL)) lit.add(JSON.parse(`"${m[1]}"`) as string);
  }
  return [...new Set([...lit, ...dataStrings()])];
}
