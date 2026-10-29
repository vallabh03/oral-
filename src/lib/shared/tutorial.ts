// Narration and on-screen text for the mouth-photo tutorial clips (DRIVE SAFE virtual registration).
// The clips in public/tutorial/<lang>/<step>.mp4 are generated from this file by
// scripts/tutorial-video/render.ts — regenerate them after changing any text here.
// Telugu and Hindi lines that differ from the approved production script (the two tongue views,
// adapted to the site's five required photos) need native-speaker review before launch.

export const TUTORIAL_LANGS = [
  { code: "en", label: "English", voice: "en-IN-NeerjaNeural" },
  { code: "te", label: "తెలుగు", voice: "te-IN-ShrutiNeural" },
  { code: "hi", label: "हिन्दी", voice: "hi-IN-SwaraNeural" },
] as const;
export type TutorialLang = (typeof TUTORIAL_LANGS)[number]["code"];

type Text = Record<TutorialLang, string>;
export type TutorialStep = {
  id: "intro" | "ready" | "lips" | "cheek_left" | "cheek_right" | "tongue_top" | "tongue_under" | "review" | "doctor";
  /** Short heading shown in the clip. */
  title: Text;
  /** Narration, also burned into the clip as subtitles. */
  say: Text;
};

export const TUTORIAL_STEPS: TutorialStep[] = [
  {
    id: "intro",
    title: { en: "5 photos → Upload → Doctor review", te: "5 ఫోటోలు → అప్‌లోడ్ → వైద్యుడి పరిశీలన", hi: "5 तस्वीरें → अपलोड → डॉक्टर की जाँच" },
    say: {
      en: "Welcome to DRIVE SAFE virtual registration. Follow these simple steps to take five clear pictures of your mouth.",
      te: "డ్రైవ్ సేఫ్ వర్చువల్ రిజిస్ట్రేషన్‌కు స్వాగతం. మీ నోటి ఐదు స్పష్టమైన ఫోటోలను తీయడానికి ఈ సూచనలను పాటించండి.",
      hi: "ड्राइव सेफ वर्चुअल रजिस्ट्रेशन में आपका स्वागत है। अपने मुंह की पाँच साफ़ तस्वीरें लेने के लिए इन आसान चरणों का पालन करें।",
    },
  },
  {
    id: "ready",
    title: { en: "Get ready", te: "సిద్ధం అవ్వండి", hi: "तैयार हो जाइए" },
    say: {
      en: "Clean your hands and phone. Find a well-lit place. Open your mouth comfortably.",
      te: "మీ చేతులను, ఫోన్‌ను శుభ్రం చేసుకోండి. మంచి వెలుతురు ఉన్న ప్రదేశంలో ఉండండి. మీ నోటిని సౌకర్యంగా తెరవండి.",
      hi: "अपने हाथ और फोन साफ़ करें। अच्छी रोशनी वाली जगह पर बैठें। आराम से अपना मुंह खोलें।",
    },
  },
  {
    id: "lips",
    title: { en: "Photo 1 of 5 · Front", te: "ఫోటో 1 / 5 · ముందు భాగం", hi: "तस्वीर 1 / 5 · सामने" },
    say: {
      en: "First, take a front-facing picture. Open your mouth wide enough to show your teeth, gums and tongue.",
      te: "మొదట, నోటి ముందు భాగం ఫోటో తీయండి. మీ పళ్లు, చిగుళ్లు, నాలుక కనిపించేలా నోరు తెరవండి.",
      hi: "पहले मुंह की सामने से तस्वीर लें। मुंह इतना खोलें कि दांत, मसूड़े और जीभ दिखाई दें।",
    },
  },
  {
    id: "cheek_left",
    title: { en: "Photo 2 of 5 · Your left side", te: "ఫోటో 2 / 5 · మీ ఎడమ వైపు", hi: "तस्वीर 2 / 5 · आपकी बाईं ओर" },
    say: {
      en: "Next, capture the left side of your mouth. Keep the area clearly visible.",
      te: "తర్వాత, మీ నోటి ఎడమ వైపు ఫోటో తీయండి. ఆ భాగం స్పష్టంగా కనిపించేలా చూడండి.",
      hi: "अब अपने मुंह के बाईं ओर की तस्वीर लें। उस हिस्से को साफ़ और स्पष्ट दिखाएं।",
    },
  },
  {
    id: "cheek_right",
    title: { en: "Photo 3 of 5 · Your right side", te: "ఫోటో 3 / 5 · మీ కుడి వైపు", hi: "तस्वीर 3 / 5 · आपकी दाईं ओर" },
    say: {
      en: "Now, capture the right side of your mouth. Make sure the picture is not blurry.",
      te: "ఇప్పుడు, మీ నోటి కుడి వైపు ఫోటో తీయండి. ఫోటో అస్పష్టంగా లేకుండా చూసుకోండి.",
      hi: "अब अपने मुंह के दाईं ओर की तस्वीर लें। ध्यान रखें कि तस्वीर धुंधली न हो।",
    },
  },
  {
    id: "tongue_top",
    title: { en: "Photo 4 of 5 · Tongue", te: "ఫోటో 4 / 5 · నాలుక", hi: "तस्वीर 4 / 5 · जीभ" },
    say: {
      en: "Now stick your tongue out as far as is comfortable, and take a picture of the top and sides of your tongue.",
      te: "ఇప్పుడు, మీకు సౌకర్యంగా ఉన్నంతవరకు నాలుకను బయటకు చాపి, నాలుక పైభాగం మరియు పక్కల ఫోటో తీయండి.",
      hi: "अब जितना आराम से हो सके, अपनी जीभ बाहर निकालें और जीभ के ऊपर और किनारों की तस्वीर लें।",
    },
  },
  {
    id: "tongue_under",
    title: { en: "Photo 5 of 5 · Under the tongue", te: "ఫోటో 5 / 5 · నాలుక కింద", hi: "तस्वीर 5 / 5 · जीभ के नीचे" },
    say: {
      en: "Finally, lift the tip of your tongue to the roof of your mouth, and capture the area under your tongue, as comfortably as possible.",
      te: "చివరిగా, నాలుక కొనను నోటి పైభాగానికి తాకించి, మీకు సౌకర్యంగా ఉన్నంతవరకు నాలుక కింద భాగం ఫోటో తీయండి.",
      hi: "अंत में, जीभ की नोक को तालू से लगाएँ और जितना आराम से संभव हो, जीभ के नीचे के हिस्से की तस्वीर लें।",
    },
  },
  {
    id: "review",
    title: { en: "Check and upload", te: "పరిశీలించి అప్‌లోడ్ చేయండి", hi: "जाँचें और अपलोड करें" },
    say: {
      en: "Check all five pictures. Retake any unclear photo, then upload all five through the registration form.",
      te: "ఐదు ఫోటోలను పరిశీలించండి. ఏదైనా స్పష్టంగా లేకపోతే మళ్లీ తీయండి. తర్వాత రిజిస్ట్రేషన్ ఫారమ్‌లో అన్ని ఫోటోలను అప్‌లోడ్ చేయండి.",
      hi: "पाँचों तस्वीरें जाँचें। कोई तस्वीर साफ़ न हो तो दोबारा लें। फिर रजिस्ट्रेशन फ़ॉर्म में सभी तस्वीरें अपलोड करें।",
    },
  },
  {
    id: "doctor",
    title: { en: "Submitted for doctor review", te: "వైద్యుడి పరిశీలనకు పంపబడింది", hi: "डॉक्टर की जाँच के लिए भेजा गया" },
    say: {
      en: "Your pictures will be reviewed by a doctor. If further assessment is needed, the healthcare team may contact you. Thank you for participating.",
      te: "మీ ఫోటోలను వైద్యుడు పరిశీలిస్తారు. మరింత పరీక్ష అవసరమైతే, వైద్య బృందం మిమ్మల్ని సంప్రదించవచ్చు. పాల్గొన్నందుకు ధన్యవాదాలు.",
      hi: "डॉक्टर आपकी तस्वीरों की जाँच करेंगे। आगे जाँच की ज़रूरत होने पर स्वास्थ्य टीम आपसे संपर्क कर सकती है। भाग लेने के लिए धन्यवाद।",
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
    en: "Can't take a photo comfortably? Tap “I need help”.",
    te: "ఫోటో తీయడం కష్టంగా ఉందా? “I need help” నొక్కండి.",
    hi: "तस्वीर लेने में दिक्कत है? “I need help” दबाएँ।",
  },
  upload: { en: "Upload photos", te: "ఫోటోలు అప్‌లోడ్", hi: "तस्वीरें अपलोड करें" },
  tagline: {
    en: "Early attention. Expert review. Better awareness.",
    te: "ముందస్తు శ్రద్ధ. నిపుణుల పరిశీలన. మెరుగైన అవగాహన.",
    hi: "समय पर ध्यान। विशेषज्ञ जाँच। बेहतर जागरूकता।",
  },
  photos: { en: "Photos", te: "ఫోటోలు", hi: "तस्वीरें" },
  upload_label: { en: "Upload", te: "అప్‌లోడ్", hi: "अपलोड" },
  review_label: { en: "Doctor review", te: "వైద్యుడి పరిశీలన", hi: "डॉक्टर की जाँच" },
  thumbs: { en: "Front|Left|Right|Tongue|Under tongue", te: "ముందు|ఎడమ|కుడి|నాలుక|నాలుక కింద", hi: "सामने|बाएँ|दाएँ|जीभ|जीभ के नीचे" },
  clean: { en: "Clean hands & phone", te: "చేతులు & ఫోన్ శుభ్రం", hi: "हाथ और फोन साफ़" },
  light: { en: "Good light", te: "మంచి వెలుతురు", hi: "अच्छी रोशनी" },
  open: { en: "Open comfortably", te: "సౌకర్యంగా తెరవండి", hi: "आराम से खोलें" },
} satisfies Record<string, Text>;

/** Map from a photo view (see virtual.ts MOUTH_VIEWS) to its tutorial clip. */
export const VIEW_CLIP: Partial<Record<string, TutorialStep["id"]>> = {
  lips: "lips", cheek_left: "cheek_left", cheek_right: "cheek_right", tongue_top: "tongue_top", tongue_under: "tongue_under",
};

export const clipUrl = (lang: TutorialLang, step: TutorialStep["id"] | "full") => `/tutorial/${lang}/${step}.mp4`;
