"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Icon } from "../Icon";
import { postJson } from "./api";

export function WorkspaceNav({ items, variant }: { items: { href: string; label: string; icon: string }[]; variant: "side" | "tabs" }) {
  const pathname = usePathname();
  const active = (href: string) => pathname === href || (href !== "/workspace/patients" && pathname.startsWith(href + "/")) || (href === "/workspace/patients" && /^\/workspace\/patients\/(?!new)[^/]+/.test(pathname));
  return (
    <nav className={variant === "side" ? "" : "ws-tabs"} aria-label={variant === "side" ? "Workspace sections" : "Workspace sections (compact)"}>
      {items.map((i) => (
        <Link key={i.href} href={i.href} aria-current={active(i.href) ? "page" : undefined}>
          {variant === "side" && <Icon name={i.icon} />} {i.label}
        </Link>
      ))}
    </nav>
  );
}

export async function logout() {
  try {
    await postJson("/api/auth/logout", {});
  } finally {
    window.location.assign("/workspace/login?signed_out=1");
  }
}

export function LogoutButton() {
  return (
    <button type="button" className="btn btn-ghost btn-sm" onClick={() => void logout()} aria-label="Sign out">
      <Icon name="logout" size={16} /> <span className="hide-xs">Sign out</span>
    </button>
  );
}

/**
 * Shared camp devices: after inactivity, warn, then sign out and clear the screen (PRD §9.1).
 * The server also enforces a 30-minute idle timeout independently.
 */
export function IdleLogout({ minutes }: { minutes: number }) {
  const [warn, setWarn] = useState(false);
  const last = useRef(Date.now());
  useEffect(() => {
    const bump = () => {
      last.current = Date.now();
      setWarn(false);
    };
    const events = ["pointerdown", "keydown", "scroll", "touchstart"];
    events.forEach((e) => window.addEventListener(e, bump, { passive: true }));
    const t = window.setInterval(() => {
      const idle = (Date.now() - last.current) / 60000;
      if (idle >= minutes) void logout();
      else if (idle >= minutes - 1) setWarn(true);
    }, 10_000);
    return () => {
      events.forEach((e) => window.removeEventListener(e, bump));
      window.clearInterval(t);
    };
  }, [minutes]);
  if (!warn) return null;
  return (
    <div className="cookie-banner" role="alertdialog" aria-live="assertive" aria-label="Inactivity warning">
      <p><strong>You will be signed out in about a minute</strong> because this device has been inactive.</p>
      <button type="button" className="btn btn-primary btn-sm" onClick={() => { last.current = Date.now(); setWarn(false); }}>Stay signed in</button>
    </div>
  );
}
