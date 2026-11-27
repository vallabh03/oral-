// English texts that reach participants through data rather than t("…") literals in components.
// The translation test checks every dictionary covers these plus every literal in the components.
import { CONSENT_POLICIES, CONTACT_PREFERENCES, DRIVER_TYPES, RECRUITMENT_SOURCES } from "../constants";
import { PROTOCOL } from "../protocol";
import { SUBMITTED_MESSAGE } from "../virtual";

/** Consents shown on the participant registration form. */
export const PARTICIPANT_CONSENTS = ["registration", "screening", "remote_images", "review_notifications", "photo", "followup_contact", "whatsapp_report"] as const;

/** Messages from validateAnswers() that the questionnaire shows next to a question. */
export const QUESTIONNAIRE_MESSAGES = ["Please answer this question", "Invalid selection", "“None” cannot be combined with other options", "Unknown question"];

/** Components whose t("…") literals must be translated. */
export const TRANSLATED_COMPONENTS = [
  "src/components/client/RegistrationForm.tsx",
  "src/components/client/Questionnaire.tsx",
  "src/components/client/ParticipantJourney.tsx",
];

export function dataStrings(): string[] {
  const out = new Set<string>();
  for (const c of PARTICIPANT_CONSENTS) out.add(CONSENT_POLICIES[c].text);
  for (const list of [DRIVER_TYPES, RECRUITMENT_SOURCES, CONTACT_PREFERENCES]) for (const o of list) out.add(o.label);
  for (const q of PROTOCOL.questions) {
    out.add(q.text);
    for (const o of q.options) out.add(o.label);
  }
  QUESTIONNAIRE_MESSAGES.forEach((m) => out.add(m));
  out.add(SUBMITTED_MESSAGE);
  return [...out];
}
