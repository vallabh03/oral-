"use client";
import { createContext, useContext, useEffect, useRef, useState, type ReactNode, type FormEvent } from "react";
import { Globe2 } from "lucide-react";
import { languages, isLocale, localeInfo, type Locale } from "@/lib/i18n/languages";
import { translate } from "@/lib/i18n";
const Context = createContext({ locale: "en" as Locale, setLocale: (_: Locale) => {}, profileSaved: false });
const storageKey = "drive-safe.language";
export function LanguageProvider({ children }: { children: ReactNode }) {
  const [locale, update] = useState<Locale>("en");
  const [profileSaved, saved] = useState(false);
  const changed = useRef(false);
  const writes = useRef(Promise.resolve());
  useEffect(() => {
    try { const local = localStorage.getItem(storageKey); if (isLocale(local)) { update(local); changed.current = true; } } catch { /* Private browsing can disable storage. */ }
    void fetch("/api/preferences").then(async r => {
      if (!r.ok) return;
      const data = await r.json() as { locale?: string };
      if (!changed.current && isLocale(data.locale)) update(data.locale);
    }).catch(() => {});
    const onStorage = (e: StorageEvent) => { if (e.key === storageKey && isLocale(e.newValue)) update(e.newValue); };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);
  useEffect(() => {
    document.documentElement.lang = locale;
    document.documentElement.dir = localeInfo(locale).dir;
    document.querySelectorAll("input,select,textarea").forEach(el => {
      const control = el as unknown as { setCustomValidity: (message: string) => void };
      control.setCustomValidity("");
    });
  }, [locale]);
  const setLocale = (next: Locale) => {
    changed.current = true;
    update(next);
    saved(false);
    try { localStorage.setItem(storageKey, next); } catch { /* The current page still works. */ }
    // Preference only: no patient information is sent or stored on this device.
    writes.current = writes.current.then(async () => {
      try {
        const r = await fetch("/api/preferences", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ locale: next }) });
        saved(r.ok);
      } catch { saved(false); }
    });
  };
  return <Context.Provider value={{ locale, setLocale, profileSaved }}>{children}</Context.Provider>;
}
export function useLanguage() { return useContext(Context); }
export function useT() { const { locale } = useLanguage(); return (text: string, clinical = false) => translate(locale, text, clinical).text; }
export function useLocalizedValidation() {
  const t = useT();
  return {
    onInvalid: (event: FormEvent<HTMLFormElement>) => {
      const field = event.target as HTMLInputElement;
      if (typeof field.setCustomValidity === "function") field.setCustomValidity(t(field.validity.valueMissing ? "Please complete this required field." : "Please enter a valid value for this field."));
    },
    onInput: (event: FormEvent<HTMLFormElement>) => {
      const field = event.target as HTMLInputElement;
      if (typeof field.setCustomValidity === "function") field.setCustomValidity("");
    },
  };
}
export function T({ children, text, clinical = false }: { children?: ReactNode; text?: string | null; clinical?: boolean }) {
  const { locale } = useLanguage();
  const source = text ?? (typeof children === "string" ? children : null);
  if (source === null) return <>{children}</>;
  const result = translate(locale, source, clinical);
  return result.lang === locale ? <>{result.text}</> : <span data-i18n-fallback lang={result.lang} dir={localeInfo(result.lang).dir}>{result.text}</span>;
}
export function LanguageSelector({ registration = false, value, onChange }: { registration?: boolean; value?: Locale; onChange?: (v: Locale) => void }) {
  const { locale, setLocale } = useLanguage();
  return <label className={`language-selector ${registration ? "language-registration" : ""}`}>
    <span><Globe2 size={16} aria-hidden="true" />{registration ? <T>Select your preferred language</T> : <span lang="en">भाषा / Language</span>}</span>
    <select aria-label="Language" value={value ?? locale} onChange={e => { if (isLocale(e.target.value)) (onChange ?? setLocale)(e.target.value); }}>
      {languages.map(l => <option key={l.code} value={l.code} lang={l.code} dir={l.dir}>{l.name}</option>)}
    </select>
    {(value ?? locale) !== "en" && <small className="language-coverage"><T>Some content is shown in English.</T></small>}
  </label>;
}
export function ClinicalLanguageNotice() {
  const { locale } = useLanguage();
  if (locale === "en") return null;
  return <p className="notice language-notice" role="note"><T>Medical questions and consent are shown in English until a reviewed translation is available. Please ask the screening team for language assistance.</T></p>;
}
