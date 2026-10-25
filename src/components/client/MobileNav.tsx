"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Icon } from "../Icon";

export function MobileNav({ items }: { items: { href: string; label: string }[] }) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const btn = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);

  useEffect(() => setOpen(false), [pathname]);
  useEffect(() => {
    if (!open) return;
    document.body.style.overflow = "hidden";
    panel.current?.querySelector<HTMLElement>("a, input")?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        btn.current?.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = "";
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <>
      <button ref={btn} type="button" className="icon-btn menu-toggle" aria-expanded={open} aria-controls="mobile-nav" aria-label={open ? "Close menu" : "Open menu"} onClick={() => setOpen((o) => !o)}>
        <Icon name={open ? "close" : "menu"} />
      </button>
      <div id="mobile-nav" ref={panel} className="mobile-nav" hidden={!open}>
        <form className="search-form" action="/search" role="search" style={{ marginBottom: 12 }}>
          <label htmlFor="m-search" className="visually-hidden">Search the website</label>
          <input id="m-search" type="search" name="q" placeholder="Search the website" maxLength={80} />
          <button className="btn btn-primary" type="submit">Search</button>
        </form>
        <nav aria-label="Mobile">
          <ul>
            {items.map((i) => (
              <li key={i.href}>
                <Link href={i.href} aria-current={pathname === i.href || (i.href !== "/" && pathname.startsWith(i.href + "/")) ? "page" : undefined}>{i.label}</Link>
              </li>
            ))}
            <li><Link href="/register" className="btn btn-primary btn-block" style={{ marginTop: 16, border: 0 }}>Register for screening</Link></li>
          </ul>
        </nav>
      </div>
    </>
  );
}

export function DesktopNavLinks({ items }: { items: { href: string; label: string }[] }) {
  const pathname = usePathname();
  return (
    <ul>
      {items.map((i) => (
        <li key={i.href}>
          <Link href={i.href} aria-current={pathname === i.href || pathname.startsWith(i.href + "/") ? "page" : undefined}>{i.label}</Link>
        </li>
      ))}
    </ul>
  );
}
