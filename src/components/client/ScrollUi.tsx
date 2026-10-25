"use client";
import { useEffect, useRef, useState } from "react";
import { Icon } from "../Icon";

/** Scroll progress bar + back-to-top button; shown only once useful (FR-PUB-08). */
export function ScrollUi() {
  const bar = useRef<HTMLSpanElement>(null);
  const [showTop, setShowTop] = useState(false);
  useEffect(() => {
    let frame = 0;
    const update = () => {
      frame = 0;
      const max = document.documentElement.scrollHeight - window.innerHeight;
      const p = max > 0 ? Math.min(1, window.scrollY / max) : 0;
      bar.current?.style.setProperty("--p", String(p));
      setShowTop(window.scrollY > window.innerHeight * 1.2);
    };
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };
    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      cancelAnimationFrame(frame);
    };
  }, []);
  const toTop = () => {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    window.scrollTo({ top: 0, behavior: reduce ? "auto" : "smooth" });
    document.getElementById("main")?.focus({ preventScroll: true });
  };
  return (
    <>
      <div className="scroll-progress" aria-hidden="true"><span ref={bar} /></div>
      <button type="button" className="icon-btn back-to-top no-print" hidden={!showTop} onClick={toTop} aria-label="Back to top">
        <Icon name="arrowUp" />
      </button>
    </>
  );
}
