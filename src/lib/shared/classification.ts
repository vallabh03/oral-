// Four-group classification engine (PRD FR-CLI-03/05, §12.3). Pure and deterministic.
// Only clinician-verified inputs may be passed in; uncertain or missing lesion status is
// never forced into a group (ADR-05 pending clinical-owner approval).

export type GroupCode = 1 | 2 | 3 | 4;

export const PATHWAYS: Record<GroupCode, string> = {
  1: "Education and warning-sign guidance",
  2: "Clinical lesion evaluation",
  3: "Cessation support and planned follow-up",
  4: "Lesion evaluation plus cessation support",
};

export type ClassificationInput = {
  questionnaireCompleted: boolean;
  examCompleted: boolean;
  examVerified: boolean;
  habitPresent: boolean | null;
  lesionPresent: "yes" | "no" | "uncertain" | null;
};

export type ClassificationResult =
  | { ok: true; group: GroupCode; pathway: string; habitPresent: boolean; lesionPresent: boolean }
  | { ok: false; reason: "questionnaire_incomplete" | "exam_incomplete" | "not_verified" | "habit_unknown" | "lesion_uncertain" | "lesion_missing" };

export function classify(input: ClassificationInput): ClassificationResult {
  if (!input.questionnaireCompleted) return { ok: false, reason: "questionnaire_incomplete" };
  if (!input.examCompleted) return { ok: false, reason: "exam_incomplete" };
  if (!input.examVerified) return { ok: false, reason: "not_verified" };
  if (input.habitPresent === null) return { ok: false, reason: "habit_unknown" };
  if (input.lesionPresent === null) return { ok: false, reason: "lesion_missing" };
  if (input.lesionPresent === "uncertain") return { ok: false, reason: "lesion_uncertain" };
  const habit = input.habitPresent;
  const lesion = input.lesionPresent === "yes";
  const group: GroupCode = !habit && !lesion ? 1 : !habit && lesion ? 2 : habit && !lesion ? 3 : 4;
  return { ok: true, group, pathway: PATHWAYS[group], habitPresent: habit, lesionPresent: lesion };
}

export const CLASSIFICATION_BLOCK_MESSAGES: Record<Exclude<ClassificationResult, { ok: true }>["reason"], string> = {
  questionnaire_incomplete: "The participant questionnaire is not complete.",
  exam_incomplete: "The oral examination was not completed.",
  not_verified: "The examination has not been verified by a clinician.",
  habit_unknown: "Habit status could not be determined from the questionnaire.",
  lesion_missing: "Lesion status has not been recorded.",
  lesion_uncertain: "Lesion status is uncertain — refer for specialist evaluation. No group is assigned until the clinical owner-approved rule resolves it.",
};
