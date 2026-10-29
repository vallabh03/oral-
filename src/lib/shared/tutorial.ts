// Narration and on-screen text for the mouth-photo tutorial (DRIVE SAFE virtual registration).
// The videos in public/tutorial/<lang>/ are generated from this file by
// scripts/tutorial-video/render.ts — regenerate them after changing any text here.
//   - guide.mp4: the mandatory 45-second guide shown before photo capture (TUTORIAL_VERSION)
//   - <view>.mp4: an optional short clip for each required photo
// Telugu and Hindi lines need native-speaker review before launch.

export const TUTORIAL_LANGS = [
  { code: "en", label: "English", voice: "en-IN-NeerjaNeural" },
  { code: "te", label: "తెలుగు", voice: "te-IN-ShrutiNeural" },
  { code: "hi", label: "हिन्दी", voice: "hi-IN-SwaraNeural" },
] as const;
export type TutorialLang = (typeof TUTORIAL_LANGS)[number]["code"];
export const TUTORIAL_LANG_CODES = TUTORIAL_LANGS.map((l) => l.code) as [TutorialLang, ...TutorialLang[]];

/** Version of the mandatory guide; recorded with each completion. Change it when the guide changes. */
export const TUTORIAL_VERSION = "2026-10-30.1";
/** Target length of the mandatory guide, in seconds. */
export const GUIDE_SECONDS = 45;

type Text = Record<TutorialLang, string>;
export type PhotoView = "lips" | "cheek_left" | "cheek_right" | "upper_mouth" | "lower_mouth";
export type TutorialScene = {
  id: string;
  /** Which illustration to draw. Photo scenes show that view being photographed. */
  scene: "intro" | "photo" | "review";
  view?: PhotoView;
  /** Short heading shown in the clip. */
  title: Text;
  /** Narration, also burned into the clip as subtitles. */
  say: Text;
};

const TITLES: Record<PhotoView, Text> = {
  lips: { en: "Photo 1 of 5 · Front", te: "ఫోటో 1 / 5 · ముందు భాగం", hi: "तस्वीर 1 / 5 · सामने" },
  cheek_left: { en: "Photo 2 of 5 · Your left side", te: "ఫోటో 2 / 5 · మీ ఎడమ వైపు", hi: "तस्वीर 2 / 5 · आपकी बाईं ओर" },
  cheek_right: { en: "Photo 3 of 5 · Your right side", te: "ఫోటో 3 / 5 · మీ కుడి వైపు", hi: "तस्वीर 3 / 5 · आपकी दाईं ओर" },
  upper_mouth: { en: "Photo 4 of 5 · Upper mouth", te: "ఫోటో 4 / 5 · నోటి పైభాగం", hi: "तस्वीर 4 / 5 · मुंह का ऊपरी हिस्सा" },
  lower_mouth: { en: "Photo 5 of 5 · Lower mouth", te: "ఫోటో 5 / 5 · నోటి కింది భాగం", hi: "तस्वीर 5 / 5 · मुंह का निचला हिस्सा" },
};

/** The mandatory 45-second guide, scene by scene. */
export const GUIDE_SCENES: TutorialScene[] = [
  {
    id: "intro", scene: "intro",
    title: { en: "Photo guide", te: "ఫోటో గైడ్", hi: "फोटो गाइड" },
    say: {
      en: "Use your own phone to take five clear photos of your mouth, in good light.",
      te: "మీ ఫోన్‌తో, మంచి వెలుతురులో, మీ నోటి ఐదు స్పష్టమైన ఫోటోలు తీయండి.",
      hi: "अपने फोन से, अच्छी रोशनी में, मुंह की पाँच साफ़ तस्वीरें लें।",
    },
  },
  {
    id: "lips", scene: "photo", view: "lips", title: TITLES.lips,
    say: {
      en: "One: front. Open wide to show your teeth, gums and tongue.",
      te: "ఒకటి: ముందు భాగం. పళ్లు, చిగుళ్లు, నాలుక కనిపించేలా నోరు తెరవండి.",
      hi: "एक: सामने से। मुंह खोलें, दांत, मसूड़े और जीभ दिखें।",
    },
  },
  {
    id: "cheek_left", scene: "photo", view: "cheek_left", title: TITLES.cheek_left,
    say: {
      en: "Two: your left side. Gently pull your cheek out with a clean finger.",
      te: "రెండు: మీ ఎడమ వైపు. శుభ్రమైన వేలితో బుగ్గను మెల్లగా లాగండి.",
      hi: "दो: बाईं ओर। साफ़ उंगली से गाल धीरे से खींचें।",
    },
  },
  {
    id: "cheek_right", scene: "photo", view: "cheek_right", title: TITLES.cheek_right,
    say: {
      en: "Three: your right side, the same way.",
      te: "మూడు: మీ కుడి వైపు, అదే విధంగా.",
      hi: "तीन: दाईं ओर, इसी तरह।",
    },
  },
  {
    id: "upper_mouth", scene: "photo", view: "upper_mouth", title: TITLES.upper_mouth,
    say: {
      en: "Four: upper mouth. Tilt your head back and photograph the roof of your mouth.",
      te: "నాలుగు: నోటి పైభాగం. తల కొంచెం వెనక్కి వంచి, అంగిలి ఫోటో తీయండి.",
      hi: "चार: ऊपरी हिस्सा। सिर पीछे करें, तालू की तस्वीर लें।",
    },
  },
  {
    id: "lower_mouth", scene: "photo", view: "lower_mouth", title: TITLES.lower_mouth,
    say: {
      en: "Five: lower mouth. Lift your tongue and photograph under it.",
      te: "ఐదు: నోటి కింది భాగం. నాలుకను పైకి ఎత్తి, దాని కింద ఫోటో తీయండి.",
      hi: "पाँच: निचला हिस्सा। जीभ उठाएँ, उसके नीचे की तस्वीर लें।",
    },
  },
  {
    id: "done", scene: "review",
    title: { en: "Check and upload", te: "పరిశీలించి అప్‌లోడ్ చేయండి", hi: "जाँचें और अपलोड करें" },
    say: {
      en: "Check each photo, retake any blurry one, then upload. A doctor will review them.",
      te: "ప్రతి ఫోటో చూసి, అస్పష్టంగా ఉంటే మళ్లీ తీయండి. తర్వాత అప్‌లోడ్ చేయండి. వైద్యుడు వాటిని పరిశీలిస్తారు.",
      hi: "हर तस्वीर जाँचें, धुंधली हो तो दोबारा लें, फिर अपलोड करें। डॉक्टर जाँच करेंगे।",
    },
  },
];

/** Optional per-photo clips ("Watch how") shown beside each required photo. */
export const VIEW_CLIPS: TutorialScene[] = [
  {
    id: "lips", scene: "photo", view: "lips", title: TITLES.lips,
    say: {
      en: "First, take a front-facing picture. Open your mouth wide enough to show your teeth, gums and tongue.",
      te: "మొదట, నోటి ముందు భాగం ఫోటో తీయండి. మీ పళ్లు, చిగుళ్లు, నాలుక కనిపించేలా నోరు తెరవండి.",
      hi: "पहले मुंह की सामने से तस्वीर लें। मुंह इतना खोलें कि दांत, मसूड़े और जीभ दिखाई दें।",
    },
  },
  {
    id: "cheek_left", scene: "photo", view: "cheek_left", title: TITLES.cheek_left,
    say: {
      en: "Next, capture the left side of your mouth. Keep the area clearly visible.",
      te: "తర్వాత, మీ నోటి ఎడమ వైపు ఫోటో తీయండి. ఆ భాగం స్పష్టంగా కనిపించేలా చూడండి.",
      hi: "अब अपने मुंह के बाईं ओर की तस्वीर लें। उस हिस्से को साफ़ और स्पष्ट दिखाएं।",
    },
  },
  {
    id: "cheek_right", scene: "photo", view: "cheek_right", title: TITLES.cheek_right,
    say: {
      en: "Now, capture the right side of your mouth. Make sure the picture is not blurry.",
      te: "ఇప్పుడు, మీ నోటి కుడి వైపు ఫోటో తీయండి. ఫోటో అస్పష్టంగా లేకుండా చూసుకోండి.",
      hi: "अब अपने मुंह के दाईं ओर की तस्वीर लें। ध्यान रखें कि तस्वीर धुंधली न हो।",
    },
  },
  {
    id: "upper_mouth", scene: "photo", view: "upper_mouth", title: TITLES.upper_mouth,
    say: {
      en: "Next, the upper mouth. Tilt your head back, open wide, and photograph the roof of your mouth and your upper gums. A helper makes this easier.",
      te: "తర్వాత, నోటి పైభాగం. తల వెనక్కి వంచి, నోరు బాగా తెరిచి, అంగిలి మరియు పై చిగుళ్ల ఫోటో తీయండి. ఎవరైనా సహాయం చేస్తే సులభం.",
      hi: "अब मुंह का ऊपरी हिस्सा। सिर पीछे करें, मुंह पूरा खोलें और तालू व ऊपरी मसूड़ों की तस्वीर लें। किसी की मदद से यह आसान होगा।",
    },
  },
  {
    id: "lower_mouth", scene: "photo", view: "lower_mouth", title: TITLES.lower_mouth,
    say: {
      en: "Finally, the lower mouth. Lift the tip of your tongue, and photograph under your tongue and your lower gums, as comfortably as possible.",
      te: "చివరిగా, నోటి కింది భాగం. నాలుక కొనను పైకి ఎత్తి, మీకు సౌకర్యంగా ఉన్నంతవరకు నాలుక కింద మరియు కింది చిగుళ్ల ఫోటో తీయండి.",
      hi: "अंत में, मुंह का निचला हिस्सा। जीभ की नोक ऊपर उठाएँ और जितना आराम से हो सके, जीभ के नीचे और निचले मसूड़ों की तस्वीर लें।",
    },
  },
];

/** Small on-screen labels used inside the clips. */
export const TUTORIAL_UI = {
  privacy: {
    en: "Upload only through the official, secure registration form.",
    te: "అధికారిక, సురక్షిత రిజిస్ట్రేషన్ ఫారమ్ ద్వారా మాత్రమే అప్‌లోడ్ చేయండి.",
    hi: "केवल आधिकारिक, सुरक्षित रजिस्ट्रेशन फ़ॉर्म से ही अपलोड करें।",
  },
  help: {
    en: "Can't take a photo comfortably? Tap “Need help?”.",
    te: "ఫోటో తీయడం కష్టంగా ఉందా? “Need help?” నొక్కండి.",
    hi: "तस्वीर लेने में दिक्कत है? “Need help?” दबाएँ।",
  },
  upload: { en: "Upload photos", te: "ఫోటోలు అప్‌లోడ్", hi: "तस्वीरें अपलोड करें" },
  photos: { en: "5 photos", te: "5 ఫోటోలు", hi: "5 तस्वीरें" },
  upload_label: { en: "Upload", te: "అప్‌లోడ్", hi: "अपलोड" },
  review_label: { en: "Doctor review", te: "వైద్యుడి పరిశీలన", hi: "डॉक्टर की जाँच" },
  thumbs: { en: "Front|Left|Right|Upper|Lower", te: "ముందు|ఎడమ|కుడి|పైభాగం|కింది భాగం", hi: "सामने|बाएँ|दाएँ|ऊपर|नीचे" },
} satisfies Record<string, Text>;

/** Map from a photo view (see virtual.ts MOUTH_VIEWS) to its optional clip. */
export const VIEW_CLIP: Partial<Record<string, PhotoView>> = Object.fromEntries(VIEW_CLIPS.map((c) => [c.view!, c.view!]));

export const clipUrl = (lang: TutorialLang, clip: PhotoView | "guide") => `/tutorial/${lang}/${clip}.mp4`;
