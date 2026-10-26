"use client";
import { useEffect, useRef, useState } from "react";

/**
 * Plays a section's entrance animation once it scrolls into view.
 * Progressive enhancement: content is fully visible until this mounts, and stays static
 * (no hidden state at all) for people who prefer reduced motion or browsers without
 * IntersectionObserver. CSS keys off data-reveal="pending" | "shown".
 */
export function Reveal({ as: Tag = "div", className, children }: { as?: "div" | "ol" | "ul"; className?: string; children: React.ReactNode }) {
  const ref = useRef<HTMLElement>(null);
  const [state, setState] = useState<"off" | "pending" | "shown">("off");

  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === "undefined" || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    // Already on screen at load (e.g. a deep link): show immediately rather than flash.
    if (el.getBoundingClientRect().top < window.innerHeight * 0.85) {
      setState("shown");
      return;
    }
    setState("pending");
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setState("shown");
          io.disconnect();
        }
      },
      { rootMargin: "0px 0px -15% 0px", threshold: 0.15 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <Tag ref={ref as never} className={className} data-reveal={state === "off" ? undefined : state}>
      {children}
    </Tag>
  );
}
