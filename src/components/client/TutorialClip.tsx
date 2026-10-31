"use client";
import { useEffect, useRef, useState } from "react";
import {
  clipUrl, GUIDE_SCENES, GUIDE_SECONDS, TUTORIAL_LANGS, TUTORIAL_VERSION, VIEW_CLIPS, type PhotoView, type TutorialLang,
} from "@/lib/shared/tutorial";
import { postJson } from "./api";

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

function LanguagePicker({ lang, setLang }: { lang: TutorialLang; setLang: (l: TutorialLang) => void }) {
  return (
    <div className="tut-langs" role="group" aria-label="Video language">
      {TUTORIAL_LANGS.map((l) => (
        <button key={l.code} type="button" lang={l.code} className={`tut-lang ${l.code === lang ? "is-on" : ""}`} aria-pressed={l.code === lang} onClick={() => setLang(l.code)}>{l.label}</button>
      ))}
    </div>
  );
}

/**
 * Short narrated video for one photo, or the whole guide ("guide"). Optional and collapsed by
 * default so mobile data is only used when the participant asks for it.
 */
export function TutorialClip({ step, label }: { step: PhotoView | "guide"; label: string }) {
  const [lang, setLang] = useTutorialLang();
  const [open, setOpen] = useState(false);
  const caption = step === "guide" ? null : VIEW_CLIPS.find((c) => c.view === step)?.say[lang];
  return (
    <div className="tut">
      {!open ? (
        <button type="button" className="btn btn-secondary btn-sm tut-open" onClick={() => setOpen(true)}>
          <span aria-hidden="true">▶</span> {label}
        </button>
      ) : (
        <>
          <LanguagePicker lang={lang} setLang={setLang} />
          {/* Keyed by language: switching language reloads the clip in that language. */}
          <video key={lang} className="tut-video" src={clipUrl(lang, step)} controls playsInline preload="metadata" autoPlay width={960} height={540} aria-label={label} />
          {caption && <p className="tut-caption" lang={lang}>{caption}</p>}
        </>
      )}
    </div>
  );
}

/**
 * The 45-second guide shown before photo capture. Patients can skip it; otherwise "Start taking photos" stays disabled
 * until the video has played to the end (skipping ahead is not counted); completion is then
 * recorded with the language and guide version. Watching is not consent.
 */
export function TutorialGate({ onDone }: { onDone: () => void }) {
  const [lang, setLang] = useTutorialLang();
  const video = useRef<HTMLVideoElement>(null);
  const watched = useRef(0);
  const [seconds, setSeconds] = useState(0);
  const [length, setLength] = useState(GUIDE_SECONDS);
  const [ended, setEnded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  // A new language starts the guide again from the beginning.
  useEffect(() => { watched.current = 0; setSeconds(0); setEnded(false); }, [lang]);

  const onTime = () => {
    const v = video.current!;
    // Count only continuous playback; a jump forward is undone in onSeeking.
    if (v.currentTime > watched.current && v.currentTime - watched.current < 1.5) watched.current = v.currentTime;
    setSeconds(Math.floor(watched.current));
  };
  const onSeeking = () => {
    const v = video.current!;
    if (v.currentTime > watched.current + 0.5) v.currentTime = watched.current;
  };
  const onRate = () => {
    const v = video.current!;
    if (v.playbackRate > 1) v.playbackRate = 1;
  };
  const onEnded = () => {
    if (watched.current >= length - 1.5) { setEnded(true); setSeconds(Math.round(length)); }
  };

  const start = async (skipped = false) => {
    setSaving(true);
    setError("");
    try {
      await postJson("/api/intake/virtual/tutorial", { language: lang, version: TUTORIAL_VERSION, skipped });
      onDone();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const pct = Math.min(100, Math.round((seconds / length) * 100));
  return (
    <section className="card stack tut-gate" style={{ "--stack": "12px" } as React.CSSProperties} aria-labelledby="tut-h">
      <h2 id="tut-h" className="vr-h">Step 1: Watch the photo guide ({GUIDE_SECONDS} seconds)</h2>
      <p style={{ margin: 0 }}>The guide shows how to take the five photos with your own phone. Choose your language and watch it, or skip it if you already know how.</p>
      <LanguagePicker lang={lang} setLang={setLang} />
      <video
        ref={video}
        key={lang}
        className="tut-video"
        src={clipUrl(lang, "guide")}
        controls
        controlsList="nodownload noplaybackrate"
        disablePictureInPicture
        playsInline
        preload="metadata"
        width={960}
        height={540}
        aria-label="Photo guide video"
        onLoadedMetadata={(e) => Number.isFinite(e.currentTarget.duration) && setLength(e.currentTarget.duration)}
        onTimeUpdate={onTime}
        onSeeking={onSeeking}
        onRateChange={onRate}
        onEnded={onEnded}
      />
      <div className="progress-bar" role="progressbar" aria-label="Guide watched" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct}><span style={{ width: `${pct}%` }} /></div>
      <p className="hint" role="status" style={{ margin: 0 }}>{ended ? "Guide finished. You can start taking photos." : `${seconds} of ${Math.round(length)} seconds watched`}</p>
      <details>
        <summary>Read the guide as text</summary>
        <ol lang={lang}>{GUIDE_SCENES.map((s) => <li key={s.id}>{s.say[lang]}</li>)}</ol>
      </details>
      {error && <p className="field-error" role="alert">{error}</p>}
      <div className="cluster">
        <button type="button" className="btn btn-primary" disabled={!ended || saving} onClick={() => void start()}>{saving ? "Saving…" : "Start taking photos"}</button>
        <button type="button" className="btn btn-secondary" disabled={saving} onClick={() => void start(true)}>Skip video</button>
      </div>
      <p className="hint" style={{ margin: 0 }}>This guide only shows how to take the photos. It is not a consent form.</p>
    </section>
  );
}
