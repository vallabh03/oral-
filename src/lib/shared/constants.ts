// Shared, non-secret constants used by both server and browser code.

export const ROLES = ["super_admin", "admin", "assistant"] as const;
export type Role = (typeof ROLES)[number];

export const ROLE_LABELS: Record<Role, string> = {
  super_admin: "Super Admin",
  admin: "Admin (Doctor)",
  assistant: "Assistant",
};

/**
 * The 23 language choices (PRD FR-PAR-01): English plus the 22 scheduled languages of India.
 * Native names only — UI copy falls back to English until programme-reviewed translations exist.
 */
export const LANGUAGES = [
  { code: "en", name: "English", native: "English", dir: "ltr" },
  { code: "te", name: "Telugu", native: "తెలుగు", dir: "ltr" },
  { code: "hi", name: "Hindi", native: "हिन्दी", dir: "ltr" },
  { code: "ur", name: "Urdu", native: "اردو", dir: "rtl" },
  { code: "as", name: "Assamese", native: "অসমীয়া", dir: "ltr" },
  { code: "bn", name: "Bengali", native: "বাংলা", dir: "ltr" },
  { code: "brx", name: "Bodo", native: "बड़ो", dir: "ltr" },
  { code: "doi", name: "Dogri", native: "डोगरी", dir: "ltr" },
  { code: "gu", name: "Gujarati", native: "ગુજરાતી", dir: "ltr" },
  { code: "kn", name: "Kannada", native: "ಕನ್ನಡ", dir: "ltr" },
  { code: "ks", name: "Kashmiri", native: "کٲشُر", dir: "rtl" },
  { code: "kok", name: "Konkani", native: "कोंकणी", dir: "ltr" },
  { code: "mai", name: "Maithili", native: "मैथिली", dir: "ltr" },
  { code: "ml", name: "Malayalam", native: "മലയാളം", dir: "ltr" },
  { code: "mni", name: "Manipuri", native: "ꯃꯤꯇꯩꯂꯣꯟ", dir: "ltr" },
  { code: "mr", name: "Marathi", native: "मराठी", dir: "ltr" },
  { code: "ne", name: "Nepali", native: "नेपाली", dir: "ltr" },
  { code: "or", name: "Odia", native: "ଓଡ଼ିଆ", dir: "ltr" },
  { code: "pa", name: "Punjabi", native: "ਪੰਜਾਬੀ", dir: "ltr" },
  { code: "sa", name: "Sanskrit", native: "संस्कृतम्", dir: "ltr" },
  { code: "sat", name: "Santali", native: "ᱥᱟᱱᱛᱟᱲᱤ", dir: "ltr" },
  { code: "sd", name: "Sindhi", native: "سنڌي", dir: "rtl" },
  { code: "ta", name: "Tamil", native: "தமிழ்", dir: "ltr" },
] as const;
export type LanguageCode = (typeof LANGUAGES)[number]["code"];
export const LANGUAGE_CODES = LANGUAGES.map((l) => l.code) as [LanguageCode, ...LanguageCode[]];
/** Languages with programme-approved translations. Everything else falls back to English. */
export const TRANSLATED_LANGUAGES: readonly LanguageCode[] = ["en"];

export const DRIVER_TYPES = [
  { value: "auto", label: "Auto-rickshaw" },
  { value: "cab_taxi", label: "Cab / Taxi" },
  { value: "app_cab", label: "App-based cab" },
  { value: "other", label: "Other" },
] as const;

export const RECRUITMENT_SOURCES = [
  { value: "association", label: "Driver association" },
  { value: "stand", label: "Auto/taxi stand" },
  { value: "whatsapp", label: "WhatsApp" },
  { value: "colleague", label: "Colleague" },
  { value: "poster", label: "Poster" },
  { value: "other", label: "Other" },
] as const;

export const SCREENING_MODES = [
  { value: "in_person", label: "In person" },
  { value: "virtual", label: "Virtual" },
] as const;
export type ScreeningMode = (typeof SCREENING_MODES)[number]["value"];

export const CONTACT_PREFERENCES = [
  { value: "whatsapp", label: "WhatsApp" },
  { value: "phone", label: "Phone call" },
  { value: "none", label: "Do not contact me" },
] as const;

export const PATIENT_STATUSES = [
  "registered",
  "questionnaire_in_progress",
  "questionnaire_completed",
  "checked_in",
  "exam_recorded",
  "verified",
  "report_ready",
  "follow_up_due",
  "withdrawn",
] as const;
export type PatientStatus = (typeof PATIENT_STATUSES)[number];

export const STATUS_LABELS: Record<PatientStatus, string> = {
  registered: "Registered",
  questionnaire_in_progress: "Questionnaire in progress",
  questionnaire_completed: "Questionnaire completed — awaiting clinician",
  checked_in: "Checked in at camp",
  exam_recorded: "Examination recorded — awaiting verification",
  verified: "Examination verified",
  report_ready: "Report ready",
  follow_up_due: "Follow-up due",
  withdrawn: "Withdrawn",
};

export const ORAL_FINDINGS = [
  { value: "no_abnormality", label: "No abnormality" },
  { value: "ulcer", label: "Ulcer" },
  { value: "leukoplakia", label: "Leukoplakia / white lesion" },
  { value: "erythroplakia", label: "Erythroplakia / red lesion" },
  { value: "red_white", label: "Red-white lesion" },
  { value: "osmf", label: "Clinically suggestive OSMF" },
  { value: "restricted_opening", label: "Restricted mouth opening" },
  { value: "growth", label: "Mucosal growth / proliferative lesion" },
  { value: "induration", label: "Induration" },
  { value: "neck_node", label: "Neck swelling / node" },
  { value: "other", label: "Other abnormality" },
] as const;

export const LESION_SITES = [
  { value: "right_buccal", label: "Right buccal mucosa" },
  { value: "left_buccal", label: "Left buccal mucosa" },
  { value: "tongue", label: "Tongue" },
  { value: "floor_of_mouth", label: "Floor of mouth" },
  { value: "gb_sulcus", label: "Gingivobuccal sulcus / alveolus" },
  { value: "palate", label: "Palate" },
  { value: "lip", label: "Lip" },
  { value: "oropharynx", label: "Oropharyngeal region" },
  { value: "other", label: "Other" },
] as const;

export const CLINICAL_IMPRESSIONS = [
  { value: "normal", label: "Normal" },
  { value: "benign", label: "Benign / non-suspicious finding" },
  { value: "pmod", label: "Potentially malignant oral disorder — requires evaluation" },
  { value: "suspicious", label: "Suspicious for malignancy" },
  { value: "uncertain", label: "Uncertain — specialist evaluation required" },
] as const;

export const CONSENT_TYPES = ["registration", "screening", "whatsapp_report", "followup_contact", "photo", "clinical_photo", "clinical_photo_face", "remote_images", "review_notifications"] as const;
export type ConsentType = (typeof CONSENT_TYPES)[number];

/** Consent wording (draft v1 — must be approved by programme/privacy owner before live intake). */
export const CONSENT_POLICIES: Record<ConsentType, { version: string; text: string; required: boolean }> = {
  registration: {
    version: "2026-10-draft-1",
    required: true,
    text: "I voluntarily agree to register for the DRIVE SAFE oral health screening programme and for my details to be stored securely for screening and follow-up.",
  },
  screening: {
    version: "2026-10-draft-1",
    required: true,
    text: "I understand that this is a screening examination and does not replace a complete medical evaluation or diagnosis.",
  },
  followup_contact: {
    version: "2026-10-draft-1",
    required: false,
    text: "I agree to be contacted by the programme about my screening result and follow-up if required.",
  },
  whatsapp_report: {
    version: "2026-10-draft-1",
    required: false,
    text: "I agree to receive my screening report on WhatsApp at the mobile number I provided.",
  },
  photo: {
    version: "2026-10-draft-1",
    required: false,
    text: "I agree to a photo of my face being taken so programme staff can confirm my identity at screening and follow-up visits. The photo is stored privately and is not shared publicly.",
  },
  // PRD v1.2 clinical photography — recorded by the clinician at examination time, separately
  // from every other consent. Draft wording pending clinical/privacy approval.
  clinical_photo: {
    version: "2026-10-draft-1",
    required: false,
    text: "I agree to close-up photographs being taken of the affected area inside or around my mouth, for my clinical record and review by authorised clinicians. Photos are stored privately, are not shared publicly, are not used for automated diagnosis, and are not included in my report or WhatsApp messages. Saying no will not affect my screening.",
  },
  clinical_photo_face: {
    version: "2026-10-draft-1",
    required: false,
    text: "I also agree that a clinical photograph may include parts of my face when this is clinically necessary.",
  },
  // Virtual screening (PRD addendum). Draft wording pending clinical/privacy approval.
  remote_images: {
    version: "2026-10-draft-1",
    required: false, // required only for virtual screening (enforced in the registration schema)
    text: "I agree to take or upload photographs of the inside of my mouth and submit them, with my answers, for review by the programme's authorised doctors. The photos are stored privately, are not shared publicly and are not used for automated diagnosis. I understand that reviewing photos has limitations: it cannot confirm or rule out oral cancer, and I should see a doctor in person if I have a persistent ulcer, lump, red or white patch, bleeding or other concerning symptom.",
  },
  review_notifications: {
    version: "2026-10-draft-1",
    required: false,
    text: "I agree to receive messages about my screening review on WhatsApp, or by SMS if WhatsApp is not available, at the mobile number I provided. Messages will not contain photos or detailed medical information.",
  },
};

export const CLINICAL_PHOTO_STATUS_LABELS = {
  granted: "Photography consented",
  declined: "Photography declined",
  withdrawn: "Photography consent withdrawn",
  not_recorded: "Photography consent not recorded",
  not_applicable: "Not applicable (no lesion recorded)",
} as const;

export const CONTACT_TOPICS = [
  { value: "general", label: "General question" },
  { value: "screening", label: "Screening & camps" },
  { value: "quit_tobacco", label: "Help to quit tobacco" },
  { value: "partner", label: "Partnership / CSR" },
  { value: "professional", label: "Healthcare professional referral" },
  { value: "privacy", label: "Privacy or data request" },
] as const;
