import "server-only";
import { z } from "zod";
import {
  CLINICAL_IMPRESSIONS, CONTACT_PREFERENCES, CONTACT_TOPICS, DRIVER_TYPES, LANGUAGE_CODES, LESION_SITES, ORAL_FINDINGS,
  PATIENT_STATUSES, RECRUITMENT_SOURCES, ROLES, SCREENING_MODES,
} from "@/lib/shared/constants";
import { FOLLOWUP_ACTIONS, MOUTH_VIEW_VALUES, TELANGANA_DISTRICTS } from "@/lib/shared/virtual";
import { TUTORIAL_LANG_CODES } from "@/lib/shared/tutorial";

// Request schemas. `.strict()` rejects unexpected fields on every mutation (checklist §3).

const vals = <T extends readonly { value: string }[]>(arr: T) => arr.map((x) => x.value) as [T[number]["value"], ...T[number]["value"][]];
const text = (max: number) => z.string().trim().min(1, "Required").max(max, `Use at most ${max} characters`);
// Letters (any script), spaces and . ' - only. Blocks markup and control characters.
const personName = text(120).regex(/^[\p{L}\p{M}][\p{L}\p{M} .'-]*$/u, "Use letters, spaces, apostrophes or hyphens");
const mobile = z.string().trim().regex(/^[6-9]\d{9}$/, "Enter a valid 10-digit Indian mobile number");
export const idempotencyKey = z.string().regex(/^[A-Za-z0-9_-]{16,64}$/, "Invalid idempotency key");

export const registrationSchema = z
  .object({
    fullName: personName,
    age: z.coerce.number().int("Enter a whole number").min(14, "Participants must be at least 14").max(110, "Enter a valid age"),
    mobile: mobile.optional().or(z.literal("").transform(() => undefined)),
    driverType: z.enum(vals(DRIVER_TYPES)),
    workingArea: z.string().trim().max(120).regex(/^[\p{L}\p{M}\p{N} ,.'/-]*$/u, "Use letters, numbers and basic punctuation").optional(),
    campId: z.string().uuid().optional().or(z.literal("").transform(() => undefined)),
    recruitmentSource: z.enum(vals(RECRUITMENT_SOURCES)),
    contactPreference: z.enum(vals(CONTACT_PREFERENCES)),
    screeningMode: z.enum(vals(SCREENING_MODES)).default("in_person"),
    // Location (virtual screening): district, mandal, PIN and address are all optional.
    district: z.enum(TELANGANA_DISTRICTS).optional().or(z.literal("").transform(() => undefined)),
    mandal: z.string().trim().max(80).regex(/^[\p{L}\p{M}\p{N} .'/-]*$/u, "Use letters, numbers and basic punctuation").transform((v) => v || undefined).optional(),
    pincode: z.string().trim().regex(/^[1-9]\d{5}$/, "Enter a valid 6-digit PIN code").optional().or(z.literal("").transform(() => undefined)),
    addressLine: z.string().trim().max(300).regex(/^[\p{L}\p{M}\p{N} ,.'#/()-]*$/u, "Use letters, numbers and basic punctuation").transform((v) => v || undefined).optional(),
    language: z.enum(LANGUAGE_CODES),
    consents: z
      .object({
        registration: z.literal(true, { message: "Registration consent is required" }),
        screening: z.literal(true, { message: "Screening consent is required" }),
        followupContact: z.boolean(),
        whatsappReport: z.boolean(),
        photo: z.boolean(),
        remoteImages: z.boolean().default(false),
        reviewNotifications: z.boolean().default(false),
      })
      .strict(),
    idempotencyKey,
    website: z.string().max(0, "Leave this field empty").optional(), // honeypot
  })
  .strict()
  .superRefine((v, ctx) => {
    if ((v.consents.whatsappReport || v.consents.followupContact || v.contactPreference !== "none") && !v.mobile) {
      ctx.addIssue({ code: "custom", path: ["mobile"], message: "A mobile number is needed for the contact options you chose" });
    } else if (v.screeningMode === "virtual" && !v.mobile) {
      ctx.addIssue({ code: "custom", path: ["mobile"], message: "A mobile number is needed so the team can call you for virtual screening" });
    } else if (v.consents.reviewNotifications && !v.mobile) {
      ctx.addIssue({ code: "custom", path: ["mobile"], message: "A mobile number is needed for review messages" });
    }
  });
export type RegistrationInput = z.infer<typeof registrationSchema>;

export const questionnaireSchema = z
  .object({
    answers: z.record(z.string().max(40), z.union([z.string().max(40), z.array(z.string().max(40)).max(12)])),
    complete: z.boolean(),
    idempotencyKey,
  })
  .strict();

export const loginSchema = z.object({ email: z.string().trim().toLowerCase().email().max(254), password: z.string().min(1).max(128) }).strict();
export const mfaSchema = z.object({ code: z.string().trim().regex(/^\d{6}$/, "Enter the 6-digit code") }).strict();
export const resetRequestSchema = z.object({ email: z.string().trim().toLowerCase().email().max(254) }).strict();
export const resetCompleteSchema = z.object({ token: z.string().min(20).max(128), password: z.string().min(1).max(128) }).strict();

export const createUserSchema = z
  .object({
    email: z.string().trim().toLowerCase().email().max(254),
    displayName: personName,
    role: z.enum(ROLES),
    campScope: z.array(z.string().uuid()).max(100).nullable().optional(),
  })
  .strict();
export const updateUserSchema = z
  .object({
    role: z.enum(ROLES).optional(),
    status: z.enum(["active", "deactivated"]).optional(),
    campScope: z.array(z.string().uuid()).max(100).nullable().optional(),
    resetMfa: z.literal(true).optional(),
  })
  .strict();

export const campSchema = z
  .object({
    code: z.string().trim().toUpperCase().regex(/^[A-Z0-9-]{2,24}$/, "Use 2–24 letters, digits or hyphens"),
    name: text(120),
    workingArea: text(120),
    startsAt: z.string().datetime({ offset: true }).optional().nullable(),
    endsAt: z.string().datetime({ offset: true }).optional().nullable(),
    capacity: z.number().int().min(1).max(100000).optional().nullable(),
    status: z.enum(["planned", "active", "closed", "cancelled"]),
    isPublic: z.boolean(),
  })
  .strict();

export const searchSchema = z.object({
  q: z.string().trim().max(64).optional(),
  campId: z.string().uuid().optional(),
  status: z.enum(PATIENT_STATUSES).optional(),
  mode: z.enum(vals(SCREENING_MODES)).optional(),
  cursor: z.string().max(200).optional(),
  limit: z.coerce.number().int().min(1).max(50).default(25),
});

export const examSchema = z
  .object({
    examCompleted: z.enum(["yes", "unable_or_refused"]),
    mouthOpening: z.enum(["normal", "restricted"]).optional().nullable(),
    interIncisorMm: z.number().min(0).max(90).optional().nullable(),
    oralFindings: z.array(z.enum(vals(ORAL_FINDINGS))).max(11),
    lesionSites: z.array(z.enum(vals(LESION_SITES))).max(9),
    lesionPresent: z.enum(["yes", "no", "uncertain"]).optional().nullable(),
    clinicalImpression: z.enum(vals(CLINICAL_IMPRESSIONS)).optional().nullable(),
    notes: z.string().trim().max(2000).optional().nullable(),
    correctionReason: z.string().trim().min(5).max(500).optional(),
  })
  .strict()
  .superRefine((v, ctx) => {
    if (v.examCompleted === "yes") {
      if (!v.mouthOpening) ctx.addIssue({ code: "custom", path: ["mouthOpening"], message: "Record mouth opening" });
      if (!v.oralFindings.length) ctx.addIssue({ code: "custom", path: ["oralFindings"], message: "Record oral findings" });
      if (!v.lesionPresent) ctx.addIssue({ code: "custom", path: ["lesionPresent"], message: "Record whether a lesion is present" });
      if (!v.clinicalImpression) ctx.addIssue({ code: "custom", path: ["clinicalImpression"], message: "Select a clinical impression" });
      if (v.oralFindings.includes("no_abnormality") && v.oralFindings.length > 1)
        ctx.addIssue({ code: "custom", path: ["oralFindings"], message: "“No abnormality” cannot be combined with findings" });
      if (v.lesionPresent === "no" && v.oralFindings.some((f) => f !== "no_abnormality" && f !== "restricted_opening"))
        ctx.addIssue({ code: "custom", path: ["lesionPresent"], message: "Findings indicate a lesion — confirm lesion status" });
      if (v.lesionPresent === "yes" && v.lesionSites.length === 0) ctx.addIssue({ code: "custom", path: ["lesionSites"], message: "Record the lesion site" });
    }
  });

export const followUpSchema = z
  .object({
    referralRequired: z.enum(["no", "planned_routine", "priority"]),
    referralDestination: z.enum(["government_hospital", "haoc_specialist", "preferred_doctor", "other"]).optional().nullable(),
    followUpRequired: z.boolean(),
    dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
    contactOutcome: z.enum(["contacted", "no_answer", "wrong_number"]).optional().nullable(),
    referralOutcome: z.enum(["planned", "attended", "did_not_attend", "declined", "unable_to_contact", "pending"]).optional().nullable(),
    cessationOutcome: z.enum(["interested_referred", "not_interested", "not_applicable", "unknown"]).optional().nullable(),
  })
  .strict();

export const consentWithdrawSchema = z.object({ consentType: z.enum(["whatsapp_report", "followup_contact", "photo", "registration", "screening", "clinical_photo", "clinical_photo_face", "remote_images", "review_notifications"]) }).strict();

// Clinical photography consent decision, recorded by the examining clinician (PRD v1.2 §4).
export const clinicalPhotoConsentSchema = z
  .object({
    decision: z.enum(["granted", "declined"]),
    // Only meaningful when decision = granted; faces are photographed only if clinically necessary.
    faceDecision: z.enum(["granted", "declined"]).optional(),
    // Language the consent statement was actually read in (defaults to the participant's preference).
    language: z.enum(LANGUAGE_CODES).optional(),
  })
  .strict();

export const lesionUploadQuerySchema = z.object({
  examId: z.string().uuid(),
  lesionSite: z.enum(vals(LESION_SITES)),
  includesFace: z.enum(["true", "false"]).default("false").transform((v) => v === "true"),
  replacesId: z.string().uuid().optional(),
});

export const lesionLinkSchema = z.object({ variant: z.enum(["view", "download", "preview"]) }).strict();
export const lesionDeleteSchema = z.object({ reason: z.string().trim().min(3, "Give a reason").max(300) }).strict();

export const contactSchema = z
  .object({
    name: personName,
    email: z.string().trim().toLowerCase().email("Enter a valid email address").max(254),
    topic: z.enum(vals(CONTACT_TOPICS)),
    message: z.string().trim().min(10, "Please write at least 10 characters").max(3000, "Use at most 3000 characters"),
    idempotencyKey,
    website: z.string().max(0).optional(),
  })
  .strict();

export const eventSchema = z
  .object({
    name: z.string().max(40),
    path: z.string().max(120),
    utm_source: z.string().max(64).optional(),
    utm_medium: z.string().max(64).optional(),
    utm_campaign: z.string().max(64).optional(),
  })
  .strict();

export const exportSchema = z
  .object({ campId: z.string().uuid().optional(), from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(), to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional() })
  .strict();

// ---- Virtual screening -------------------------------------------------------------------
export const virtualTicketSchema = z.object({
  view: z.enum(MOUTH_VIEW_VALUES),
  contentType: z.enum(["image/jpeg", "image/png", "image/webp"]),
  bytes: z.number().int().min(1),
  capturedBy: z.enum(["patient", "caregiver"]).default("patient"),
}).strict();
export const virtualAssistanceSchema = z.object({ note: z.string().trim().max(500).optional() }).strict();
// The patient finished the mandatory photo guide. Recorded for the timeline only; never consent.
export const tutorialCompleteSchema = z.object({ language: z.enum(TUTORIAL_LANG_CODES), version: z.string().trim().min(1).max(40), skipped: z.boolean().default(false) }).strict();
export const otpRequestSchema = z.object({
  displayId: z.string().trim().toUpperCase().regex(/^[A-Z]{2,8}(-[A-Z]{2,8})?-\d{1,8}$/, "Enter your participant ID"),
  mobile,
}).strict();
export const otpVerifySchema = otpRequestSchema.extend({ code: z.string().trim().regex(/^\d{6}$/, "Enter the 6-digit code") }).strict();
export const imageReviewSchema = z.object({
  decision: z.enum(["acceptable", "needs_retake"]),
  note: z.string().trim().max(500).optional(),
}).strict();
export const caseDecisionSchema = z.discriminatedUnion("decision", [
  z.object({ decision: z.literal("more_images"), notes: z.string().trim().max(4000).optional() }).strict(),
  z.object({
    decision: z.enum(["no_suspicious", "suspicious", "referral"]),
    notes: z.string().trim().max(4000).optional(),
    nextSteps: z.string().trim().max(2000).optional(),
    lesionLocation: z.string().trim().max(200).optional(),
  }).strict(),
  z.object({
    decision: z.literal("inconclusive"),
    inconclusiveAction: z.enum(["more_images", "in_person"]),
    notes: z.string().trim().max(4000).optional(),
    nextSteps: z.string().trim().max(2000).optional(),
    lesionLocation: z.string().trim().max(200).optional(),
  }).strict(),
]);
export const virtualFollowupSchema = z.object({
  action: z.enum(vals(FOLLOWUP_ACTIONS)),
  note: z.string().trim().max(1000).optional(),
}).strict();
export const virtualQueueSchema = z.object({
  status: z.enum(["awaiting_review", "more_images_requested", "reviewed", "help", "awaiting_images", "all"]).default("awaiting_review"),
});
