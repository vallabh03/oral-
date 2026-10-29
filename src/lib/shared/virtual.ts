// Shared, non-secret definitions for virtual screening (patient-captured mouth images reviewed
// remotely by a doctor). Used by both server and browser code.

/**
 * The standard photo set (updated virtual registration requirements, 2026-10-30): five required
 * labelled views plus an optional close-up. `required` views must be present (or help requested)
 * to submit. Value codes are stable; the first three keep their original codes.
 */
export const MOUTH_VIEWS = [
  {
    value: "lips",
    label: "Front view",
    required: true,
    steps: ["Face a window or bright light.", "Open your mouth wide so your teeth, gums and tongue show.", "Hold the phone straight in front of your mouth, about a hand's length away."],
  },
  {
    value: "cheek_left",
    label: "Left-side view",
    required: true,
    steps: ["Open your mouth wide.", "Use a clean finger or spoon to pull your left cheek outwards.", "Point the camera at the inside of the cheek, teeth and gums on that side."],
  },
  {
    value: "cheek_right",
    label: "Right-side view",
    required: true,
    steps: ["Open your mouth wide.", "Use a clean finger or spoon to pull your right cheek outwards.", "Point the camera at the inside of the cheek, teeth and gums on that side."],
  },
  {
    value: "upper_mouth",
    label: "Upper mouth view",
    required: true,
    steps: ["Tilt your head back and open wide.", "Point the camera upwards to show the roof of your mouth and your upper gums.", "A helper makes this easier."],
  },
  {
    value: "lower_mouth",
    label: "Lower mouth view",
    required: true,
    steps: ["Open your mouth and lift the tip of your tongue to the roof of your mouth.", "Point the camera downwards to show under your tongue, the floor of your mouth and your lower gums.", "Only as far as is comfortable."],
  },
  {
    value: "concern",
    label: "Any area that worries you",
    required: false,
    steps: ["If you have an ulcer, patch, lump or sore anywhere in your mouth, photograph it closely.", "Keep it in focus: tap the screen on the area before taking the photo."],
  },
] as const;
export type MouthView = (typeof MOUTH_VIEWS)[number]["value"];
export const MOUTH_VIEW_VALUES = MOUTH_VIEWS.map((v) => v.value) as [MouthView, ...MouthView[]];
export const REQUIRED_VIEWS = MOUTH_VIEWS.filter((v) => v.required).map((v) => v.value) as MouthView[];
/** Views from the earlier nine-photo set, kept so older records still show a readable label. */
const LEGACY_VIEW_LABELS: Record<string, string> = {
  upper_gums: "Upper lip (inside) and upper gums", lower_gums: "Lower lip (inside) and lower gums",
  tongue_top: "Top and sides of the tongue", tongue_under: "Under the tongue", palate: "Roof of the mouth",
};
export const viewLabel = (v: string) => MOUTH_VIEWS.find((x) => x.value === v)?.label ?? LEGACY_VIEW_LABELS[v] ?? v;

export const VIRTUAL_CASE_STATUSES = ["awaiting_images", "submitted", "in_review", "more_images_requested", "reviewed", "closed"] as const;
export type VirtualCaseStatus = (typeof VIRTUAL_CASE_STATUSES)[number];
export const VIRTUAL_STATUS_LABELS: Record<VirtualCaseStatus, string> = {
  awaiting_images: "Waiting for photos",
  submitted: "Pending Review",
  in_review: "In Review",
  more_images_requested: "New photos requested",
  reviewed: "Reviewed",
  closed: "Closed",
};

/**
 * Review status shown to doctors and patients: a reviewed case reads "Reviewed", "Follow-up
 * Required" or "Unable to Assess" depending on the doctor's outcome.
 */
export function reviewStatusLabel(status: VirtualCaseStatus, outcome: ReviewOutcome | null): string {
  if (status === "reviewed") return outcome === "suspicious" ? "Follow-up Required" : outcome === "inconclusive" ? "Unable to Assess" : "Reviewed";
  return VIRTUAL_STATUS_LABELS[status];
}

export const REVIEW_OUTCOMES = [
  { value: "no_suspicious", label: "No suspicious lesion identified in the submitted images" },
  { value: "suspicious", label: "Follow-up required — suspicious lesion or abnormality identified" },
  { value: "inconclusive", label: "Unable to assess — new images or an in-person examination needed" },
] as const;
export type ReviewOutcome = (typeof REVIEW_OUTCOMES)[number]["value"];

export const FOLLOWUP_ACTIONS = [
  { value: "called", label: "Called the participant" },
  { value: "no_answer", label: "No answer" },
  { value: "appointment_booked", label: "In-person appointment booked" },
  { value: "attended", label: "Attended examination" },
  { value: "did_not_attend", label: "Did not attend" },
  { value: "referred", label: "Referred to specialist" },
  { value: "closed", label: "Case closed" },
  { value: "note", label: "Note" },
] as const;

/** Districts of Telangana (33). */
export const TELANGANA_DISTRICTS = [
  "Adilabad", "Bhadradri Kothagudem", "Hanumakonda", "Hyderabad", "Jagtial", "Jangaon", "Jayashankar Bhupalpally",
  "Jogulamba Gadwal", "Kamareddy", "Karimnagar", "Khammam", "Kumuram Bheem Asifabad", "Mahabubabad", "Mahabubnagar",
  "Mancherial", "Medak", "Medchal–Malkajgiri", "Mulugu", "Nagarkurnool", "Nalgonda", "Narayanpet", "Nirmal",
  "Nizamabad", "Peddapalli", "Rajanna Sircilla", "Ranga Reddy", "Sangareddy", "Siddipet", "Suryapet", "Vikarabad",
  "Wanaparthy", "Warangal", "Yadadri Bhuvanagiri",
] as const;

/** Shown to the patient once the server has confirmed the submission (updated requirements, 2026-10-30). */
export const SUBMITTED_MESSAGE = "Thank you for registering with DRIVE SAFE. Your photographs have been submitted for doctor review. If further assessment is needed, the healthcare team may contact you.";

/** Notification templates. Wording must match the templates approved by Meta (and DLT for SMS). */
export const NOTIFICATION_TEMPLATES = {
  review_suspicious: {
    label: "Further evaluation recommended",
    body: "Dear {{name}}, your submitted oral screening images have been reviewed by our doctor. Further clinical evaluation is recommended. Please contact {{clinic}} at {{phone}} to arrange the next steps. This screening result is not a confirmed diagnosis.",
  },
  review_more_images: {
    label: "Clearer images needed",
    body: "Dear {{name}}, we need clearer images to complete your oral screening review. Please log in to your registration page and follow the image-capture instructions, or contact {{clinic}} for assistance.",
  },
  review_no_lesion: {
    label: "No suspicious lesion seen",
    body: "Dear {{name}}, your submitted images have been reviewed. No suspicious lesion was identified in the images provided. This does not rule out oral disease. Please seek clinical evaluation if you have persistent symptoms or concerns.",
  },
  submission_received: {
    label: "Submission received",
    body: "Dear {{name}}, we have received your oral screening photos (ID {{id}}). A doctor will review them and we will message you here.",
  },
  login_code: {
    label: "Login code",
    body: "{{code}} is your verification code. For your security, do not share this code.",
  },
} as const;
export type NotificationTemplate = keyof typeof NOTIFICATION_TEMPLATES;

export function renderTemplate(t: NotificationTemplate, vars: Record<string, string>): string {
  return NOTIFICATION_TEMPLATES[t].body.replace(/\{\{(\w+)\}\}/g, (_, k: string) => vars[k] ?? "");
}
