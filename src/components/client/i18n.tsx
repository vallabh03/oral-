"use client";
import { createContext, useContext, useMemo, useState } from "react";
import { LANGUAGES, type LanguageCode } from "@/lib/shared/constants";
import { translator, type Translate } from "@/lib/shared/i18n";

type Ctx = { lang: LanguageCode; setLang: (l: LanguageCode) => void; available: readonly LanguageCode[]; preview: boolean };
const LangContext = createContext<Ctx | null>(null);

/** Participant pages only. Staff screens have no provider, so they always stay in English. */
export function LangProvider({ available, preview = false, children }: { available: readonly LanguageCode[]; preview?: boolean; children: React.ReactNode }) {
  const [lang, setLang] = useState<LanguageCode>("en");
  const value = useMemo(() => ({ lang, setLang, available, preview }), [lang, available, preview]);
  return <LangContext.Provider value={value}>{children}</LangContext.Provider>;
}

/** The language the participant chose, if its translation is switched on; otherwise English. */
export function useLang() {
  const c = useContext(LangContext);
  const active: LanguageCode = c && c.available.includes(c.lang) ? c.lang : "en";
  const t: Translate = useMemo(() => translator(active), [active]);
  const dir = LANGUAGES.find((l) => l.code === active)!.dir;
  return { t, lang: active, dir, chosen: c?.lang ?? "en", setLang: c?.setLang, available: c?.available ?? [], preview: c?.preview ?? false };
}
