# Language system and review handoff

The site has a single React language context and a shared client/server catalogue lookup, not browser translation. All 23 requested languages appear in native script. No patient data is sent to a translation service. Source values, questionnaire IDs, answers, roles, dates and analytics remain canonical; only presentation labels change.

## Coverage and current limits

English is the complete source. Telugu and Hindi have expanded navigation, registration, landing and reporting vocabulary. Other languages have core navigation and controls. This is **not a completed professional translation of every screen into all 23 languages**. Missing wording remains English with an English language attribute. The selector explicitly states that some content is in English. Interface translations are draft copy and need native-language QA, especially the less commonly supported languages.

No medically reviewed non-English questionnaires or consent wording were provided. Clinical catalogues are intentionally empty. Questions, answer options, clinical guidance and consent must fall back to their English source until a qualified reviewer approves an exact translation. This release must not be represented as medically reviewed multilingual patient intake. Real intake and staff activation remain subject to existing locks and governance approval.

Run `node scripts/check-translations.mjs` for a catalogue validation and a local coverage inventory in `outputs/translation-coverage.json`.

## Editing and reviewing translations

`lib/i18n/locales/<code>.json` holds interface messages and clinical translations. English source sentences are stable lookup keys. Add or correct an interface translation under `messages`. Do not translate identifiers, patient names, personal free text, laboratory PDFs or database values.

For clinical text, the `clinical` entry must include `text`, the exact English `source`, the qualified reviewer's `reviewer` identity, and ISO `reviewedAt`. Never invent approval. The lookup checks the source matches the current question; changed or missing source/review metadata reverts to English. A protocol wording change therefore requires translation review again. Add the entry for the whole question and each answer label. Consent wording must match the operationally approved version. Store reviewer evidence under the programme's governance process, not in public patient records.

`lib/i18n/clinical-sources.json` protects the existing clinical vocabulary from accidental use of the unreviewed UI dictionary. Dynamic questionnaire text and options also explicitly use the clinical lookup. Keep new health/consent copy in the clinical path. Catalogue validation and tests exercise the review gate.

## Preferences and data

- Device preference: `drive-safe.language` in local storage; it contains only a locale code. Storage failure does not prevent use of the current page.
- Signed-in account preference: `/api/preferences`, keyed only by trusted authenticated user identity. It does not accept a target user ID or grant clinical access. Writes are same-origin, limited in size, validated and serialized client-side.
- Registration: `patients.preferred_language` stores the selected locale, defaulting existing participants to `en`. No translated answer columns are created.
- Reports: staff can select a language or choose the participant's language. The printable report has its own language selector and retains existing report permissions. Clinical records and attached laboratory files remain original source content; no automatic translation is applied to them. JSON/CSV exports retain canonical data.

## Fonts and layout

Eleven self-hosted Noto font families cover the requested scripts; their SIL Open Font Licences are included under `public/fonts`. Browser font requests never go to an external font service. Kashmiri and Sindhi use Perso-Arabic UI variants and expose both script names in the selector; Meitei uses the requested Bengali-script form. Urdu, Kashmiri and Sindhi set document direction to RTL. The sidebar moves to the right, fields and tables use logical alignment, and identifiers/phone fields remain directionally isolated.

Language changes update text without remounting forms or changing answer values. Native field validation uses the active catalogue with English fallback. Screen-reader document language changes with the locale; fallback text is marked English. Physical Android/iOS and assistive-technology testing and linguistic review are still required before claiming device/accessibility certification.

## Landing additions

The reference-inspired contact strip, support cards, upcoming camp area and expanded footer preserve the existing palette and branding. Contact links use configured programme details. No reference-image phone numbers, external brand identity or fictional camp dates were copied. Camp announcements use live programme camps only when public intake is enabled; otherwise the site shows an honest empty state. Donation and sponsorship actions are enquiries, not payment collection.
