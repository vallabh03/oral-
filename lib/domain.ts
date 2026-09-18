import { z } from "zod";
export const accountTypes = [
  "DOCTOR_ADMIN",
  "SUPER_ADMIN",
  "ASSISTANT",
] as const;
export const roleLabels: Record<string, string> = {
  DOCTOR_ADMIN: "Doctor – Admin",
  SUPER_ADMIN: "Tech Support – Super Admin",
  ASSISTANT: "Assistant – Data & Reporting",
};
export function hasRole(role: string, ...allowed: string[]) {
  const grants: Record<string, string[]> = {
    DOCTOR_ADMIN: ["ADMIN", "DOCTOR", "REGISTRATION", "LAB", "COUNSELLOR"],
    SUPER_ADMIN: ["ADMIN", "REGISTRATION", "LAB", "COUNSELLOR"],
  };
  return (
    allowed.includes(role) ||
    (grants[role] || []).some((r) => allowed.includes(r))
  );
}
export const roles = [
  ...accountTypes,
  "ADMIN",
  "REGISTRATION",
  "COUNSELLOR",
  "DOCTOR",
  "LAB",
  "PATIENT",
] as const;
export const sampleStates = [
  "Collected",
  "Sent to lab",
  "Received",
  "Processing",
  "Report generated",
  "Report verified",
  "Report linked",
];
export const registration = z
  .object({
    name: z.string().trim().min(2).max(120),
    phone: z.string().regex(/^(\+?[0-9]{10,15})?$/),
    age: z.number().int().min(0).max(120),
    campId: z.string().min(1),
    driverType: z.enum(["Auto", "Cab-Taxi", "App-based cab", "Other"]),
    workingArea: z.string().trim().min(2).max(160),
    recruitment: z.enum([
      "Driver association",
      "Stand",
      "WhatsApp",
      "Colleague",
      "Poster",
      "Other",
    ]),
    contactIntended: z.boolean(),
    registrationConsent: z.literal(true),
    screeningConsent: z.literal(true),
  })
  .strict()
  .superRefine((d, c) => {
    if (d.contactIntended && !d.phone)
      c.addIssue({
        code: "custom",
        message: "Mobile number is required for contact",
      });
  });
const value = z.union([
  z.string().max(3000),
  z.number().finite(),
  z.boolean(),
  z.array(z.string().max(200)).max(30),
]);
const condition = z.object({
  questionId: z.string().min(1),
  equals: value.optional(),
  notEquals: value.optional(),
});
export const protocolSchema = z
  .object({
    version: z.string().min(1).max(40),
    questions: z
      .array(
        z.object({
          id: z.string().regex(/^[a-zA-Z0-9_-]{1,60}$/),
          text: z.string().min(1).max(1000),
          type: z.enum([
            "yesno",
            "single",
            "multiple",
            "text",
            "number",
            "duration",
            "frequency",
          ]),
          required: z.boolean(),
          options: z.array(z.string().min(1).max(200)).max(30).optional(),
          unit: z.string().max(30).optional(),
          when: condition.optional(),
        }),
      )
      .min(1)
      .max(100),
    rules: z
      .array(
        z.object({
          id: z.string().min(1),
          when: z.array(condition).min(1),
          category: z.enum(["1", "2", "3", "4"]),
          pathway: z.string().min(1).max(160),
        }),
      )
      .max(50)
      .default([]),
  })
  .superRefine((p, ctx) => {
    const ids = new Set<string>();
    for (const q of p.questions) {
      if (ids.has(q.id))
        ctx.addIssue({
          code: "custom",
          message: "Question IDs must be unique",
        });
      if (q.when && !ids.has(q.when.questionId))
        ctx.addIssue({
          code: "custom",
          message: "Conditions must reference an earlier question",
        });
      if (
        ["single", "multiple", "frequency"].includes(q.type) &&
        !q.options?.length
      )
        ctx.addIssue({
          code: "custom",
          message: "Choice questions need options",
        });
      if (q.type === "duration" && !q.unit)
        ctx.addIssue({ code: "custom", message: "Duration requires a unit" });
      ids.add(q.id);
    }
    if (!ids.has("habits"))
      ctx.addIssue({
        code: "custom",
        message: "DRIVE SAFE requires the habits question",
      });
  });
export type Protocol = z.infer<typeof protocolSchema>;
export function visible(
  q: Protocol["questions"][number],
  answers: Record<string, unknown>,
) {
  if (!q.when) return true;
  if (!Object.hasOwn(answers, q.when.questionId)) return false;
  return q.when.notEquals !== undefined
    ? JSON.stringify(answers[q.when.questionId]) !==
        JSON.stringify(q.when.notEquals)
    : JSON.stringify(answers[q.when.questionId]) ===
        JSON.stringify(q.when.equals);
}
export function validateAnswers(p: Protocol, answers: Record<string, unknown>) {
  const clean: Record<string, unknown> = {};
  for (const q of p.questions) {
    if (!visible(q, clean)) continue;
    const a = answers[q.id];
    if (a === undefined || a === "" || (Array.isArray(a) && !a.length)) {
      if (q.required) throw new Error("Please answer: " + q.text);
      continue;
    }
    if (q.type === "yesno" && typeof a !== "boolean")
      throw new Error("Expected yes/no answer");
    if (
      ["number", "duration"].includes(q.type) &&
      (typeof a !== "number" || !Number.isFinite(a) || a < 0)
    )
      throw new Error("Expected a non-negative number");
    if (
      ["single", "frequency"].includes(q.type) &&
      !q.options?.includes(a as string)
    )
      throw new Error("Invalid option");
    if (
      q.type === "multiple" &&
      (!Array.isArray(a) ||
        a.some((v) => !q.options?.includes(v)) ||
        new Set(a).size !== a.length ||
        (a.includes("None") && a.length > 1))
    )
      throw new Error(
        "Select “None” on its own, or select the reported options.",
      );
    if (q.type === "text" && (typeof a !== "string" || a.length > 3000))
      throw new Error("Invalid text");
    clean[q.id] = a;
  }
  return clean;
}
export function evaluate(p: Protocol, answers: Record<string, unknown>) {
  const clean = validateAnswers(p, answers);
  const matches = p.rules.filter((r) =>
    r.when.every(
      (c) =>
        Object.hasOwn(clean, c.questionId) &&
        JSON.stringify(clean[c.questionId]) === JSON.stringify(c.equals),
    ),
  );
  if (matches.length !== 1)
    throw new Error("Clinical examination and verification are required.");
  return { answers: clean, rule: matches[0] };
}
export const groupPaths: Record<string, string> = {
  "1": "Education",
  "2": "Clinical lesion pathway",
  "3": "Cessation + planned follow-up",
  "4": "Clinical lesion pathway + cessation",
};
export function classify(
  habit: boolean,
  lesion: boolean,
  examCompleted: boolean,
  verified: boolean,
) {
  if (!examCompleted || !verified)
    throw new Error(
      "Completed oral examination and clinician verification are required.",
    );
  return !habit ? (lesion ? "2" : "1") : lesion ? "4" : "3";
}
export function nextSample(current: string, next: string) {
  return (
    sampleStates.indexOf(next) === sampleStates.indexOf(current) + 1 &&
    sampleStates.indexOf(current) >= 0
  );
}
export function canAccess(
  role: string,
  actor: string,
  p: { doctor_id?: string; counsellor_id?: string; id: string },
  patientId?: string,
) {
  return (
    accountTypes.includes(role as (typeof accountTypes)[number]) ||
    role === "ADMIN" ||
    role === "REGISTRATION" ||
    (role === "DOCTOR" && p.doctor_id === actor) ||
    (role === "COUNSELLOR" && p.counsellor_id === actor) ||
    (role === "PATIENT" && p.id === patientId)
  );
}
export function treatmentAllowed(
  role: string,
  hasAssessment: boolean,
  consented: boolean,
  decision: string,
) {
  return (
    hasRole(role, "DOCTOR") &&
    hasAssessment &&
    consented &&
    decision.trim().length >= 10
  );
}
export const pilotConsent =
  "I voluntarily agree to participate in the DRIVE SAFE oral health screening programme. I understand that this is a screening examination and does not replace a complete medical evaluation. I agree to be contacted regarding my screening result and follow-up if required.";
export const pilot: Protocol = {
  version: "DRIVE-SAFE-1.0-draft",
  rules: [],
  questions: [
    {
      id: "habits",
      text: "Current habit",
      type: "multiple",
      required: true,
      options: [
        "Cigarette",
        "Bidi",
        "Gutkha/tobacco-containing pan masala",
        "Khaini/Zarda/chewing tobacco",
        "Pan with tobacco",
        "Supari/areca nut/pan masala without tobacco",
        "Other tobacco",
        "None",
      ],
    },
    {
      id: "duration",
      text: "Duration",
      type: "single",
      required: true,
      options: ["<5 years", "5–10 years", ">10 years", "Not applicable"],
    },
    {
      id: "frequency",
      text: "Frequency",
      type: "frequency",
      required: true,
      options: [
        "Occasional/not every day",
        "1–5 times per day",
        ">5 times per day",
        "Not applicable",
      ],
    },
    {
      id: "symptoms",
      text: "Current oral warning symptoms",
      type: "multiple",
      required: true,
      options: [
        "Non-healing mouth ulcer/wound",
        "White/red patch",
        "Reduced mouth opening",
        "Persistent oral pain/burning",
        "Lump/swelling in mouth or neck",
        "Difficulty/pain while swallowing",
        "None",
      ],
    },
    {
      id: "symptom_duration",
      text: "If symptomatic: present for >2 weeks?",
      type: "single",
      required: true,
      options: ["Yes", "No", "Not applicable"],
      when: { questionId: "symptoms", notEquals: ["None"] },
    },
    {
      id: "awareness",
      text: "Before today, did you know tobacco/gutkha/supari can increase oral-cancer risk?",
      type: "yesno",
      required: true,
    },
    {
      id: "warning_awareness",
      text: "Did you know a persistent mouth ulcer, red/white patch or other mouth change lasting >2 weeks should be examined?",
      type: "yesno",
      required: true,
    },
    {
      id: "previous_screening",
      text: "Ever had an oral-cancer screening examination?",
      type: "single",
      required: true,
      options: ["Yes", "No", "Don’t know"],
    },
    {
      id: "cessation_interest",
      text: "Would you like help to stop tobacco/areca-nut use?",
      type: "single",
      required: true,
      options: ["Yes", "Maybe", "No"],
      when: { questionId: "habits", notEquals: ["None"] },
    },
  ],
};
export const impressions = [
  "Normal",
  "Benign/non-suspicious finding",
  "Potentially malignant oral disorder/requires evaluation",
  "Suspicious for malignancy",
  "Uncertain—specialist evaluation required",
];
export const findings = [
  "No abnormality",
  "Ulcer",
  "Leukoplakia/white lesion",
  "Erythroplakia/red lesion",
  "Red-white lesion",
  "Clinically suggestive OSMF",
  "Restricted mouth opening",
  "Mucosal growth/proliferative lesion",
  "Induration",
  "Neck swelling/node",
  "Other abnormality",
];
export const sites = [
  "Right buccal mucosa",
  "Left buccal mucosa",
  "Tongue",
  "Floor of mouth",
  "Gingivobuccal sulcus/alveolus",
  "Palate",
  "Lip",
  "Oropharyngeal region",
  "Other",
  "N/A",
];
