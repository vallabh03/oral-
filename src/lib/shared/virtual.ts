// Shared, non-secret definitions for virtual screening (patient-captured mouth images reviewed
// remotely by a doctor). Used by both server and browser code.

/**
 * The standard photo set. Draft for clinical-owner approval: which views are required, and the
 * wording of each instruction. `required` views must be present (or help requested) to submit.
 */
export const MOUTH_VIEWS = [
  {
    value: "lips",
    label: "Lips and front teeth",
    required: true,
    steps: ["Face a window or bright light.", "Smile widely so your lips and front teeth show.", "Hold the phone straight in front of your mouth, about a hand's length away."],
  },
  {
    value: "cheek_left",
    label: "Inside of your left cheek",
    required: true,
    steps: ["Open your mouth wide.", "Use a clean finger or spoon to pull your left cheek outwards.", "Point the camera at the inside of the cheek."],
  },
  {
    value: "cheek_right",
    label: "Inside of your right cheek",
    required: true,
    steps: ["Open your mouth wide.", "Use a clean finger or spoon to pull your right cheek outwards.", "Point the camera at the inside of the cheek."],
  },
  {
    value: "tongue_top",
    label: "Top and sides of your tongue",
    required: true,
    steps: ["Stick your tongue out as far as is comfortable.", "Take the photo straight on, then move it gently to each side if you can."],
  },
  {
    value: "tongue_under",
    label: "Under your tongue",
    required: true,
    steps: ["Open your mouth.", "Lift the tip of your tongue to touch the roof of your mouth.", "Photograph the area under the tongue."],
  },
  {
    value: "upper_gums",
    label: "Upper lip (inside) and upper gums",
    required: false,
    steps: ["Gently lift your upper lip with clean fingers.", "Photograph the inside of the lip and the gums."],
  },
  {
    value: "lower_gums",
    label: "Lower lip (inside) and lower gums",
    required: false,
    steps: ["Gently pull your lower lip down with clean fingers.", "Photograph the inside of the lip and the gums."],
  },
  {
    value: "palate",
    label: "Roof of your mouth",
    required: false,
    steps: ["Tilt your head back and open wide.", "Point the camera upwards into your mouth. A helper makes this easier."],
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
export const viewLabel = (v: string) => MOUTH_VIEWS.find((x) => x.value === v)?.label ?? v;

export const VIRTUAL_CASE_STATUSES = ["awaiting_images", "submitted", "in_review", "more_images_requested", "reviewed", "closed"] as const;
export type VirtualCaseStatus = (typeof VIRTUAL_CASE_STATUSES)[number];
export const VIRTUAL_STATUS_LABELS: Record<VirtualCaseStatus, string> = {
  awaiting_images: "Waiting for photos",
  submitted: "Submitted — waiting for doctor review",
  in_review: "Doctor review in progress",
  more_images_requested: "Clearer photos requested",
  reviewed: "Reviewed",
  closed: "Closed",
};

export const REVIEW_OUTCOMES = [
  { value: "no_suspicious", label: "No suspicious lesion identified in the submitted images" },
  { value: "suspicious", label: "Suspicious lesion or abnormality identified" },
  { value: "inconclusive", label: "Inconclusive — further images or an in-person examination required" },
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
