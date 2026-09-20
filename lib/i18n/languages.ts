export const languages = [
  { code: "en", name: "English", dir: "ltr" },
  { code: "te", name: "తెలుగు", dir: "ltr" },
  { code: "hi", name: "हिन्दी", dir: "ltr" },
  { code: "ta", name: "தமிழ்", dir: "ltr" },
  { code: "kn", name: "ಕನ್ನಡ", dir: "ltr" },
  { code: "ml", name: "മലയാളം", dir: "ltr" },
  { code: "mr", name: "मराठी", dir: "ltr" },
  { code: "bn", name: "বাংলা", dir: "ltr" },
  { code: "gu", name: "ગુજરાતી", dir: "ltr" },
  { code: "pa", name: "ਪੰਜਾਬੀ", dir: "ltr" },
  { code: "or", name: "ଓଡ଼ିଆ", dir: "ltr" },
  { code: "as", name: "অসমীয়া", dir: "ltr" },
  { code: "ur", name: "اردو", dir: "rtl" },
  { code: "kok", name: "कोंकणी", dir: "ltr" },
  { code: "ne", name: "नेपाली", dir: "ltr" },
  { code: "sa", name: "संस्कृतम्", dir: "ltr" },
  { code: "ks", name: "कॉशुर / کٲشُر", dir: "rtl" },
  { code: "sd", name: "सिन्धी / سنڌي", dir: "rtl" },
  { code: "mai", name: "मैथिली", dir: "ltr" },
  { code: "mni", name: "মৈতৈলোন্", dir: "ltr" },
  { code: "brx", name: "बड़ो", dir: "ltr" },
  { code: "sat", name: "ᱥᱟᱱᱛᱟᱲᱤ", dir: "ltr" },
  { code: "doi", name: "डोगरी", dir: "ltr" },
] as const;
export type Locale = (typeof languages)[number]["code"];
export function isLocale(v: unknown): v is Locale {
  return typeof v === "string" && languages.some((l) => l.code === v);
}
export function localeInfo(locale: Locale) {
  return languages.find((l) => l.code === locale)!;
}
