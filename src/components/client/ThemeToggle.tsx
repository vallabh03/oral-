"use client";
import { useEffect, useState } from "react";
import { Icon } from "../Icon";

type Theme = "light" | "dark";

function systemTheme(): Theme {
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

/** Respects the system preference by default; an explicit choice is stored (non-sensitive). */
export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme | null>(null);
  useEffect(() => {
    const stored = (() => {
      try {
        return localStorage.getItem("theme");
      } catch {
        return null;
      }
    })();
    setTheme(stored === "dark" || stored === "light" ? stored : systemTheme());
  }, []);
  const toggle = () => {
    const nextTheme: Theme = theme === "dark" ? "light" : "dark";
    setTheme(nextTheme);
    document.documentElement.dataset.theme = nextTheme;
    try {
      localStorage.setItem("theme", nextTheme);
    } catch {}
  };
  const label = theme === "dark" ? "Switch to light mode" : "Switch to dark mode";
  return (
    <button type="button" className="icon-btn" onClick={toggle} aria-label={label} title={label} aria-pressed={theme === "dark"}>
      <Icon name={theme === "dark" ? "sun" : "moon"} />
    </button>
  );
}

/** Inline, render-blocking theme bootstrap (with CSP nonce) to avoid a flash of the wrong theme. */
export const THEME_BOOTSTRAP = `try{var t=localStorage.getItem("theme");if(t==="dark"||t==="light")document.documentElement.dataset.theme=t}catch(e){}`;
