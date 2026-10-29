"use client";
import { useEffect, useState } from "react";
import { clipUrl, TUTORIAL_LANGS, TUTORIAL_STEPS, type TutorialLang, type TutorialStep } from "@/lib/shared/tutorial";

const KEY = "taoc.tutorialLang";
const EVENT = "taoc:tutorial-lang";

/** The viewer's narration language, shared by every clip on the page and remembered on this device. */
function useTutorialLang(): [TutorialLang, (l: TutorialLang) => void] {
  const [lang, setLang] = useState<TutorialLang>("en");
  useEffect(() => {
    try {
      const saved = localStorage.getItem(KEY);
      if (TUTORIAL_LANGS.some((l) => l.code === saved)) setLang(saved as TutorialLang);
    } catch {}
    const on = (e: Event) => setLang((e as CustomEvent<TutorialLang>).detail);
    window.addEventListener(EVENT, on);
    return () => window.removeEventListener(EVENT, on);
  }, []);
  const choose = (l: TutorialLang) => {
    try { localStorage.setItem(KEY, l); } catch {}
    window.dispatchEvent(new CustomEvent(EVENT, { detail: l }));
  };
  return [lang, choose];
}

/**
 * Short narrated video showing how to take one photo (or the whole guide with step="full").
 * Collapsed by default so mobile data is only used when the participant asks for it.
 */
export function TutorialClip({ step, label, open: startOpen = false }: { step: TutorialStep["id"] | "full"; label: string; open?: boolean }) {
  const [lang, setLang] = useTutorialLang();
  const [open, setOpen] = useState(startOpen);
  const caption = step === "full" ? null : TUTORIAL_STEPS.find((s) => s.id === step)?.say[lang];

  return (
    <div className="tut">
      {!open ? (
        <button type="button" className="btn btn-secondary btn-sm tut-open" onClick={() => setOpen(true)}>
          <span aria-hidden="true">▶</span> {label}
        </button>
      ) : (
        <>
          <div className="tut-langs" role="group" aria-label="Video language">
            {TUTORIAL_LANGS.map((l) => (
              <button key={l.code} type="button" lang={l.code} className={`tut-lang ${l.code === lang ? "is-on" : ""}`} aria-pressed={l.code === lang} onClick={() => setLang(l.code)}>{l.label}</button>
            ))}
          </div>
          {/* Keyed by language: switching language reloads the clip in that language. */}
          <video
            key={lang}
            className="tut-video"
            src={clipUrl(lang, step)}
            controls
            playsInline
            preload="metadata"
            autoPlay={!startOpen}
            width={960}
            height={540}
            aria-label={label}
          />
          {caption && <p className="tut-caption" lang={lang}>{caption}</p>}
        </>
      )}
    </div>
  );
}
