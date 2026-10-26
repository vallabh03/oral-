// Versioned questionnaire protocol (PRD FR-PAR-06/07). Stored answers use the stable
// `value` codes below, never translated labels. Question text is snapshotted per answer.

export type Question =
  | { id: string; type: "multi"; text: string; options: { value: string; label: string }[]; exclusive?: string; required: boolean; showIf?: (a: Answers) => boolean }
  | { id: string; type: "single"; text: string; options: { value: string; label: string }[]; required: boolean; showIf?: (a: Answers) => boolean };

export type Answers = Record<string, string | string[] | undefined>;

export const HABIT_NONE = "none";

const hasHabit = (a: Answers) => Array.isArray(a.habits) && a.habits.length > 0 && !a.habits.includes(HABIT_NONE);
const hasSymptoms = (a: Answers) => Array.isArray(a.symptoms) && a.symptoms.length > 0 && !a.symptoms.includes("none");

export const PROTOCOL = {
  id: "drive-safe-brief",
  version: "1.1.0",
  questions: [
    {
      id: "habits",
      type: "multi",
      text: "Which of these do you currently use? (Select all that apply)",
      required: true,
      exclusive: HABIT_NONE,
      options: [
        { value: "cigarette", label: "Cigarette" },
        { value: "bidi", label: "Bidi" },
        { value: "gutkha", label: "Gutkha / tobacco-containing pan masala" },
        { value: "khaini", label: "Khaini / Zarda / chewing tobacco" },
        { value: "pan_tobacco", label: "Pan with tobacco" },
        { value: "areca", label: "Supari / areca nut / pan masala without tobacco" },
        { value: "other_tobacco", label: "Other tobacco" },
        { value: HABIT_NONE, label: "None" },
      ],
    },
    {
      id: "duration",
      type: "single",
      text: "How long have you used it?",
      required: true,
      showIf: hasHabit,
      options: [
        { value: "lt5", label: "Less than 5 years" },
        { value: "5to10", label: "5–10 years" },
        { value: "gt10", label: "More than 10 years" },
      ],
    },
    {
      id: "frequency",
      type: "single",
      text: "How often do you use it?",
      required: true,
      showIf: hasHabit,
      options: [
        { value: "occasional", label: "Occasionally / not every day" },
        { value: "1to5", label: "1–5 times a day" },
        { value: "gt5", label: "More than 5 times a day" },
      ],
    },
    {
      id: "symptoms",
      type: "multi",
      text: "Do you have any of these in your mouth or neck right now? (Select all that apply)",
      required: true,
      exclusive: "none",
      options: [
        { value: "ulcer", label: "A mouth ulcer or wound that is not healing" },
        { value: "patch", label: "A white or red patch" },
        { value: "reduced_opening", label: "Difficulty opening the mouth fully" },
        { value: "pain_burning", label: "Pain or burning in the mouth that does not go away" },
        { value: "lump", label: "A lump or swelling in the mouth or neck" },
        { value: "swallowing", label: "Difficulty or pain while swallowing" },
        { value: "none", label: "None of these" },
      ],
    },
    {
      id: "symptom_gt_2w",
      type: "single",
      text: "Has it been there for more than 2 weeks?",
      required: true,
      showIf: hasSymptoms,
      options: [
        { value: "yes", label: "Yes" },
        { value: "no", label: "No" },
      ],
    },
    // 1.1.0: medical history for remote (virtual) review — asked of everyone so answers are comparable.
    {
      id: "alcohol",
      type: "single",
      text: "Do you drink alcohol?",
      required: true,
      options: [
        { value: "no", label: "No" },
        { value: "occasionally", label: "Occasionally" },
        { value: "regularly", label: "Regularly (most weeks)" },
      ],
    },
    {
      id: "medical_history",
      type: "multi",
      text: "Have you ever had any of these? (Select all that apply)",
      required: true,
      exclusive: "none",
      options: [
        { value: "oral_cancer", label: "Mouth or throat cancer" },
        { value: "precancer", label: "A white or red patch (pre-cancer) treated or checked by a doctor" },
        { value: "head_neck_radiation", label: "Radiotherapy to the head or neck" },
        { value: "sharp_tooth", label: "A broken or sharp tooth, or dentures that rub the inside of the mouth" },
        { value: "none", label: "None of these" },
      ],
    },
    {
      id: "risk_awareness",
      type: "single",
      text: "Before today, did you know tobacco, gutkha or supari can increase the risk of oral cancer?",
      required: true,
      options: [
        { value: "yes", label: "Yes" },
        { value: "no", label: "No" },
      ],
    },
    {
      id: "sign_awareness",
      type: "single",
      text: "Did you know a mouth ulcer, red/white patch or other mouth change lasting more than 2 weeks should be examined?",
      required: true,
      options: [
        { value: "yes", label: "Yes" },
        { value: "no", label: "No" },
      ],
    },
    {
      id: "previous_screening",
      type: "single",
      text: "Have you ever had an oral cancer screening examination?",
      required: true,
      options: [
        { value: "yes", label: "Yes" },
        { value: "no", label: "No" },
        { value: "dont_know", label: "Don't know" },
      ],
    },
    {
      id: "cessation_interest",
      type: "single",
      text: "Would you like help to stop using tobacco or areca nut?",
      required: true,
      showIf: hasHabit,
      options: [
        { value: "yes", label: "Yes" },
        { value: "maybe", label: "Maybe" },
        { value: "no", label: "No" },
      ],
    },
  ] satisfies Question[] as Question[],
};

export type ValidationResult = { ok: true; answers: Record<string, string | string[]> } | { ok: false; errors: Record<string, string> };

/** Validates answers against the protocol. Hidden questions are dropped, so stale answers cannot leak in. */
export function validateAnswers(input: Answers, { requireComplete }: { requireComplete: boolean }): ValidationResult {
  const errors: Record<string, string> = {};
  const out: Record<string, string | string[]> = {};
  const known = new Set(PROTOCOL.questions.map((q) => q.id));
  for (const key of Object.keys(input)) if (!known.has(key)) errors[key] = "Unknown question";

  for (const q of PROTOCOL.questions) {
    if (q.showIf && !q.showIf(input)) continue;
    const v = input[q.id];
    const allowed = new Set(q.options.map((o) => o.value));
    if (v === undefined || (Array.isArray(v) && v.length === 0) || v === "") {
      if (requireComplete && q.required) errors[q.id] = "Please answer this question";
      continue;
    }
    if (q.type === "multi") {
      if (!Array.isArray(v) || v.some((x) => typeof x !== "string" || !allowed.has(x)) || new Set(v).size !== v.length) {
        errors[q.id] = "Invalid selection";
        continue;
      }
      if (q.exclusive && v.includes(q.exclusive) && v.length > 1) {
        errors[q.id] = "“None” cannot be combined with other options";
        continue;
      }
      out[q.id] = [...v];
    } else {
      if (typeof v !== "string" || !allowed.has(v)) {
        errors[q.id] = "Invalid selection";
        continue;
      }
      out[q.id] = v;
    }
  }
  return Object.keys(errors).length ? { ok: false, errors } : { ok: true, answers: out };
}

export function habitPresentFromAnswers(a: Answers): boolean | null {
  if (!Array.isArray(a.habits) || a.habits.length === 0) return null;
  return !a.habits.includes(HABIT_NONE);
}

export function visibleQuestions(a: Answers): Question[] {
  return PROTOCOL.questions.filter((q) => !q.showIf || q.showIf(a));
}
