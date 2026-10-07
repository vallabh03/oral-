import test from "node:test";
import assert from "node:assert/strict";
import { PDFDocument } from "pdf-lib";
import { screeningPdf } from "../lib/report-pdf.ts";

test("a clinician-verified group produces a readable, single-page PDF", async () => {
  const bytes = await screeningPdf(
    { id: "HAOC-DS-0001", name: "Demo Participant", age: 42, category: "3" },
    { at: "2026-10-07T08:00:00Z", data: { impression: "Normal", mouthOpening: "Normal", notes: "private note" } },
  );
  assert.equal(new TextDecoder().decode(bytes.slice(0, 5)), "%PDF-");
  const document = await PDFDocument.load(bytes);
  assert.equal(document.getPageCount(), 1);
});
