import { describe, expect, it } from "vitest";
import { classify, PATHWAYS } from "@/lib/shared/classification";

const base = { questionnaireCompleted: true, examCompleted: true, examVerified: true };

describe("four-group classification (PRD §12.3 acceptance table)", () => {
  it.each([
    [false, "no", 1],
    [false, "yes", 2],
    [true, "no", 3],
    [true, "yes", 4],
  ] as const)("habit=%s lesion=%s → Group %i", (habit, lesion, group) => {
    const r = classify({ ...base, habitPresent: habit, lesionPresent: lesion });
    expect(r).toEqual({ ok: true, group, pathway: PATHWAYS[group], habitPresent: habit, lesionPresent: lesion === "yes" });
  });

  it("never assigns a group before questionnaire, exam and verification are complete", () => {
    expect(classify({ ...base, questionnaireCompleted: false, habitPresent: true, lesionPresent: "yes" })).toEqual({ ok: false, reason: "questionnaire_incomplete" });
    expect(classify({ ...base, examCompleted: false, habitPresent: true, lesionPresent: "yes" })).toEqual({ ok: false, reason: "exam_incomplete" });
    expect(classify({ ...base, examVerified: false, habitPresent: true, lesionPresent: "yes" })).toEqual({ ok: false, reason: "not_verified" });
  });

  it("does not silently force uncertain or missing findings into a group", () => {
    expect(classify({ ...base, habitPresent: true, lesionPresent: "uncertain" })).toEqual({ ok: false, reason: "lesion_uncertain" });
    expect(classify({ ...base, habitPresent: true, lesionPresent: null })).toEqual({ ok: false, reason: "lesion_missing" });
    expect(classify({ ...base, habitPresent: null, lesionPresent: "no" })).toEqual({ ok: false, reason: "habit_unknown" });
  });
});
