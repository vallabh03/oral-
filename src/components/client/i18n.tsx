"use client";
import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { LANGUAGES, type LanguageCode } from "@/lib/shared/constants";
import { loadDictionary, translator, type Dictionary, type Translate } from "@/lib/shared/i18n";

type Ctx = {
  lang: LanguageCode;
  setLang: (l: LanguageCode) => void;
  /** Approved languages (normal text). */
  approved: readonly LanguageCode[];
  /** Unreviewed languages shown with a draft notice and the English consent wording. */
  drafts: readonly LanguageCode[];
  preview: boolean;
  dict: Dictionary | undefined;
};
const LangContext = createContext<Ctx | null>(null);

/** Participant pages only. Staff screens have no provider, so they always stay in English. */
export function LangProvider({ approved, drafts, preview = false, children }: { approved: readonly LanguageCode[]; drafts: readonly LanguageCode[]; preview?: boolean; children: React.ReactNode }) {
  const [lang, setLang] = useState<LanguageCode>("en");
  const [loaded, setLoaded] = useState<{ lang: LanguageCode; dict: Dictionary | undefined }>({ lang: "en", dict: undefined });
  const shown = approved.includes(lang) || drafts.includes(lang);
  useEffect(() => {
    if (!shown) return;
    let live = true;
    loadDictionary(lang).then((dict) => live && setLoaded({ lang, dict })).catch(() => {});
    return () => { live = false; };
  }, [lang, shown]);
  const dict = shown && loaded.lang === lang ? loaded.dict : undefined;
  const value = useMemo(() => ({ lang, setLang, approved, drafts, preview, dict }), [lang, approved, drafts, preview, dict]);
  return <LangContext.Provider value={value}>{children}</LangContext.Provider>;
}

/** The participant's chosen language once it is switched on and loaded; otherwise English. */
export function useLang() {
  const c = useContext(LangContext);
  const active: LanguageCode = c?.dict ? c.lang : "en";
  const t: Translate = useMemo(() => translator(c?.dict), [c?.dict]);
  const dir = LANGUAGES.find((l) => l.code === active)!.dir;
  const offered = (l: LanguageCode) => l === "en" || !!c && (c.approved.includes(l) || c.drafts.includes(l));
  /** The active language is an unreviewed draft: show the notice and English consent wording. */
  const draft = active !== "en" && !!c && !c.approved.includes(active);
  return { t, lang: active, dir, draft, offered, setLang: c?.setLang, preview: c?.preview ?? false };
}
