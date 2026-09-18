import assert from "node:assert/strict";
import { test } from "node:test";
import {
  pilot,
  validateAnswers,
  classify,
  canAccess,
  nextSample,
  treatmentAllowed,
  registration,
  protocolSchema,
} from "../lib/domain.ts";
const answers = {
  habits: ["None"],
  duration: "Not applicable",
  frequency: "Not applicable",
  symptoms: ["None"],
  awareness: true,
  warning_awareness: true,
  previous_screening: "No",
};
test("four-group matrix requires completed examination and clinician verification", () => {
  assert.equal(classify(false, false, true, true), "1");
  assert.equal(classify(false, true, true, true), "2");
  assert.equal(classify(true, false, true, true), "3");
  assert.equal(classify(true, true, true, true), "4");
  assert.throws(() => classify(true, true, false, true));
  assert.throws(() => classify(true, true, true, false));
});
test("actual questionnaire stores values and suppresses hidden answers", () => {
  const r = validateAnswers(pilot, {
    ...answers,
    cessation_interest: "Yes",
    symptom_duration: "Yes",
  });
  assert.deepEqual(r, answers);
  assert.throws(() =>
    validateAnswers(pilot, { ...answers, habits: ["None", "Bidi"] }),
  );
  assert.throws(() => validateAnswers(pilot, { ...answers, habits: ["Bidi"] }));
  assert.throws(() =>
    validateAnswers(pilot, { ...answers, symptoms: ["White/red patch"] }),
  );
  assert.throws(() =>
    validateAnswers(pilot, { ...answers, previous_screening: "invented" }),
  );
});
test("registration rejects extra sensitive identifiers and missing consent", () => {
  const r = {
    name: "Demo Person",
    phone: "0000000000",
    age: 45,
    campId: "camp",
    driverType: "Auto",
    workingArea: "Demo stand",
    recruitment: "Stand",
    contactIntended: true,
    registrationConsent: true,
    screeningConsent: true,
  };
  assert.equal(registration.safeParse(r).success, true);
  assert.equal(
    registration.safeParse({ ...r, aadhaar: "123456789012" }).success,
    false,
  );
  assert.equal(
    registration.safeParse({ ...r, registrationConsent: false }).success,
    false,
  );
  assert.equal(registration.safeParse({ ...r, phone: "" }).success, false);
  assert.equal(
    registration.safeParse({ ...r, phone: "", contactIntended: false }).success,
    true,
  );
});
test("role access is assignment-scoped and patients can only view their own record", () => {
  const p = { id: "p1", doctor_id: "doc1", counsellor_id: "c1" };
  assert.equal(canAccess("DOCTOR", "doc1", p), true);
  assert.equal(canAccess("DOCTOR", "doc2", p), false);
  assert.equal(canAccess("COUNSELLOR", "c2", p), false);
  assert.equal(canAccess("PATIENT", "u1", p, "p2"), false);
  assert.equal(canAccess("PATIENT", "u1", p, "p1"), true);
  assert.equal(canAccess("LAB", "lab1", p), false);
});
test("treatment approval needs a doctor, assessment, separate consent, and decision", () => {
  assert.equal(
    treatmentAllowed("DOCTOR", true, true, "Clinician assessment and decision"),
    true,
  );
  for (const a of [
    ["ADMIN", true, true],
    ["DOCTOR", false, true],
    ["DOCTOR", true, false],
  ] as const)
    assert.equal(
      treatmentAllowed(a[0], a[1], a[2], "Clinician assessment and decision"),
      false,
    );
});
test("samples cannot skip or reverse lifecycle transitions", () => {
  assert.equal(nextSample("Collected", "Sent to lab"), true);
  assert.equal(nextSample("Collected", "Report linked"), false);
  assert.equal(nextSample("Processing", "Received"), false);
  assert.equal(nextSample("invalid", "Collected"), false);
});
test("configuration rejects duplicate IDs and forward conditional references", () => {
  assert.equal(protocolSchema.safeParse(pilot).success, true);
  assert.equal(
    protocolSchema.safeParse({
      ...pilot,
      questions: [pilot.questions[0], pilot.questions[0]],
    }).success,
    false,
  );
  assert.equal(
    protocolSchema.safeParse({
      ...pilot,
      questions: [
        { ...pilot.questions[0], when: { questionId: "later", equals: true } },
      ],
    }).success,
    false,
  );
});
