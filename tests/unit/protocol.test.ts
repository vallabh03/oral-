import { describe, expect, it } from "vitest";
import { habitPresentFromAnswers, PROTOCOL, validateAnswers, visibleQuestions } from "@/lib/shared/protocol";

const complete = { habits: ["bidi"], duration: "lt5", frequency: "occasional", symptoms: ["none"], alcohol: "occasionally", medical_history: ["none"], risk_awareness: "yes", sign_awareness: "yes", previous_screening: "dont_know", cessation_interest: "maybe" };

describe("questionnaire protocol", () => {
  it("is versioned with stable answer codes", () => {
    expect(PROTOCOL.version).toMatch(/^\d+\.\d+\.\d+$/);
    for (const q of PROTOCOL.questions) for (const o of q.options) expect(o.value).toMatch(/^[a-z0-9_]+$/);
  });

  it("accepts a complete set of answers", () => {
    expect(validateAnswers(complete, { requireComplete: true })).toEqual({ ok: true, answers: complete });
  });

  it("requires every visible question when completing", () => {
    const r = validateAnswers({ habits: ["bidi"] }, { requireComplete: true });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(Object.keys(r.errors)).toEqual(expect.arrayContaining(["duration", "frequency", "symptoms", "cessation_interest"]));
  });

  it("allows partial saves", () => {
    expect(validateAnswers({ habits: ["bidi"] }, { requireComplete: false }).ok).toBe(true);
  });

  it("hides habit follow-ups for non-users and drops stale answers", () => {
    const r = validateAnswers({ ...complete, habits: ["none"] }, { requireComplete: true });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.answers).not.toHaveProperty("duration");
    expect(visibleQuestions({ habits: ["none"] }).map((q) => q.id)).not.toContain("cessation_interest");
  });

  it("rejects unknown questions, unknown options, duplicates and 'none' combined with others", () => {
    expect(validateAnswers({ ...complete, injected: "x" }, { requireComplete: true }).ok).toBe(false);
    expect(validateAnswers({ ...complete, frequency: "always" }, { requireComplete: true }).ok).toBe(false);
    expect(validateAnswers({ ...complete, habits: ["bidi", "bidi"] }, { requireComplete: true }).ok).toBe(false);
    expect(validateAnswers({ ...complete, habits: ["bidi", "none"] }, { requireComplete: true }).ok).toBe(false);
    expect(validateAnswers({ ...complete, symptoms: "none" as unknown as string[] }, { requireComplete: true }).ok).toBe(false);
  });

  it("derives habit presence (areca without tobacco counts)", () => {
    expect(habitPresentFromAnswers({ habits: ["none"] })).toBe(false);
    expect(habitPresentFromAnswers({ habits: ["areca"] })).toBe(true);
    expect(habitPresentFromAnswers({})).toBeNull();
  });
});
