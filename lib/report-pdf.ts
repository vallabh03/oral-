import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

// The outbound PDF contains only clinician-verified screening facts. Free-text
// notes and historical laboratory data stay in the protected patient record.
export async function screeningPdf(patient: any, examination: any) {
  const doc = await PDFDocument.create();
  const page = doc.addPage([595, 842]);
  const regular = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const ink = rgb(0.09, 0.25, 0.22);
  const muted = rgb(0.37, 0.46, 0.43);
  const ascii = (value: unknown) => String(value ?? "").replace(/[^\x20-\x7e]/g, "?");
  const line = (label: string, value: unknown, y: number) => {
    page.drawText(label, { x: 48, y, size: 10, font: bold, color: ink });
    const text = ascii(value).slice(0, 85);
    page.drawText(text || "Not recorded", { x: 185, y, size: 10, font: regular, color: ink });
  };
  page.drawRectangle({ x: 0, y: 765, width: 595, height: 77, color: rgb(0.07, 0.30, 0.26) });
  page.drawText("TELANGANA AGAINST ORAL CANCER", { x: 48, y: 804, size: 16, font: bold, color: rgb(1, 1, 1) });
  page.drawText("DRIVE SAFE  |  Oral screening report", { x: 48, y: 781, size: 11, font: regular, color: rgb(1, 1, 1) });
  page.drawText("Confidential - for the participant and their care team", { x: 48, y: 734, size: 10, font: regular, color: muted });
  line("Participant ID", patient.id, 700);
  // Standard PDF fonts cannot faithfully render every Indian script. The ID is
  // the stable identifier; omit a name that would otherwise be corrupted.
  if (/^[\x20-\x7e]+$/.test(patient.name)) line("Name", patient.name, 676);
  line("Age", patient.age == null ? "Not recorded" : `${patient.age} years`, 652);
  line("Examination date", examination.at?.slice(0, 10), 628);
  line("Screening group", patient.category ? `Group ${patient.category}` : "Not classified", 604);
  line("Clinical impression", examination.data?.impression, 580);
  line("Mouth opening", examination.data?.mouthOpening, 556);
  page.drawText("What this result means", { x: 48, y: 510, size: 13, font: bold, color: ink });
  const guidance: Record<string, string[]> = {
    "1": ["No current habit or lesion recorded at screening.", "Seek assessment if a concerning mouth change develops."],
    "2": ["A mouth finding needs clinical evaluation, even without a habit.", "Follow the advice given by your clinical team."],
    "3": ["A current habit was recorded without a lesion.", "Ask about cessation support and planned re-screening."],
    "4": ["A current habit and a mouth finding were recorded.", "Clinical evaluation and cessation support should proceed together."],
  };
  (guidance[patient.category] || ["Discuss your screening result with the care team."]).forEach((text, index) => {
    page.drawText(text, { x: 48, y: 481 - 21 * index, size: 10, font: regular, color: ink });
  });
  page.drawText("This is a screening result, not a confirmed cancer diagnosis.", { x: 48, y: 405, size: 10, font: bold, color: ink });
  page.drawText("If a mouth ulcer, red/white patch, growth, swelling or difficulty opening", { x: 48, y: 382, size: 10, font: regular, color: ink });
  page.drawText("your mouth persists, seek prompt clinical assessment.", { x: 48, y: 366, size: 10, font: regular, color: ink });
  page.drawLine({ start: { x: 48, y: 94 }, end: { x: 547, y: 94 }, color: rgb(0.80, 0.86, 0.83) });
  page.drawText("Generated from a clinician-verified DRIVE SAFE record.", { x: 48, y: 75, size: 9, font: regular, color: muted });
  return doc.save();
}
