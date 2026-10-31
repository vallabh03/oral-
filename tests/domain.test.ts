import {
  permitted,
  sectionAllowed,
  dashboardPath,
} from "../lib/permissions.ts";
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  hasRole,
  accountTypes,
  programmeRoles,
  driveSafeMatrix,
  pathwayFor,
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
  assert.equal(
    registration.safeParse({ ...r, age: 17 }).success,
    false,
  );
  assert.equal(
    registration.safeParse({ ...r, phone: "", contactIntended: false, whatsappReportConsent: true }).success,
    false,
  );
  assert.equal(
    registration.safeParse({ ...r, phone: "9876543210", contactIntended: false, whatsappReportConsent: true }).success,
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

test("programme-wide roles see all participants; scoped roles only their own", () => {
  const anyPatient = {
    id: "p2",
    doctor_id: "another-doctor",
    counsellor_id: "c9",
  };
  for (const role of programmeRoles)
    assert.equal(canAccess(role, "staff", anyPatient), true);
  for (const role of ["DOCTOR", "COUNSELLOR", "LAB", "PATIENT"])
    assert.equal(canAccess(role, "staff", anyPatient, "p1"), false, role);
  assert.equal(canAccess("DOCTOR", "another-doctor", anyPatient), true);
  assert.equal(canAccess("COUNSELLOR", "c9", anyPatient), true);
  assert.equal(canAccess("PATIENT", "u", anyPatient, "p2"), true);
  assert.deepEqual(
    [...accountTypes],
    ["DOCTOR_ADMIN", "SUPER_ADMIN", "ASSISTANT"],
  );
  assert.equal(hasRole("DOCTOR_ADMIN", "ADMIN"), false);
  for (const grant of ["DOCTOR", "LAB", "REGISTRATION", "COUNSELLOR"])
    assert.equal(hasRole("DOCTOR_ADMIN", grant), true);
  assert.equal(
    hasRole("DOCTOR_ADMIN", "SUPER_ADMIN"),
    false,
    "doctor cannot grant accounts",
  );
  assert.equal(hasRole("SUPER_ADMIN", "SUPER_ADMIN"), true);
  assert.equal(
    hasRole("SUPER_ADMIN", "DOCTOR"),
    false,
    "technical account cannot sign clinical decisions",
  );
  for (const grant of [
    "ADMIN",
    "DOCTOR",
    "LAB",
    "REGISTRATION",
    "COUNSELLOR",
    "SUPER_ADMIN",
  ])
    assert.equal(
      hasRole("ASSISTANT", grant),
      false,
      "assistant cannot mutate: " + grant,
    );
  assert.equal(
    hasRole("ASSISTANT", "ADMIN", "ASSISTANT"),
    true,
    "assistant can export analysis",
  );
  assert.equal(
    treatmentAllowed("DOCTOR_ADMIN", true, true, "Clinician approved decision"),
    true,
  );
  assert.equal(
    treatmentAllowed("SUPER_ADMIN", true, true, "Clinician approved decision"),
    false,
  );
  assert.equal(
    treatmentAllowed("ASSISTANT", true, true, "Clinician approved decision"),
    false,
  );
  assert.equal(canAccess("unknown", "staff", anyPatient), false);
  assert.equal(hasRole("unknown", "SUPER_ADMIN"), false);
});

test("classification matrix is configurable but must cover every combination", () => {
  const custom = driveSafeMatrix.map((c) =>
    c.group === "3" ? { ...c, pathway: "Cessation + 6-month re-screen" } : c,
  );
  assert.equal(classify(true, false, true, true, custom), "3");
  assert.equal(pathwayFor("3", custom), "Cessation + 6-month re-screen");
  const broken = {
    ...pilot,
    classification: [...driveSafeMatrix.slice(0, 3), driveSafeMatrix[0]],
  };
  assert.equal(protocolSchema.safeParse(broken).success, false);
});

test("explicit permissions exclude doctor system controls and assistant writes", () => {
  for (const p of [
    "settings.manage",
    "users.manage",
    "audit.read",
    "backup.export",
    "qr.manage",
  ] as const)
    assert.equal(permitted("DOCTOR_ADMIN", p), false);
  assert.equal(permitted("DOCTOR_ADMIN", "clinical.write"), true);
  assert.equal(sectionAllowed("DOCTOR_ADMIN", "Protocol & settings"), false);
  assert.equal(
    sectionAllowed("DOCTOR_ADMIN", "Clinical protocol review"),
    true,
  );
  assert.equal(sectionAllowed("ASSISTANT", "System administration"), false);
  assert.equal(sectionAllowed("ASSISTANT", "Analysis & reporting"), true);
  assert.equal(permitted("ASSISTANT", "patients.write"), false);
  assert.equal(permitted("SUPER_ADMIN", "settings.manage"), true);
  assert.equal(dashboardPath("ASSISTANT"), "/workspace/assistant");
  assert.equal(permitted("invented", "patients.read"), false);
});
