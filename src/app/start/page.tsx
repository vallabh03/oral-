import type { Metadata } from "next";
import Link from "next/link";
import { config } from "@/lib/server/config";

// Target of the QR code at screening camps: only the two choices, nothing else
// (no site header, footer or cookie banner), each going straight to its registration form.
export const metadata: Metadata = { title: "Choose screening", robots: { index: false, follow: false } };

export default function StartPage() {
  const c = config();
  const big = { width: "100%", minHeight: 96, fontSize: "1.35rem" };
  return (
    <main id="main" style={{ minHeight: "100dvh", display: "grid", placeItems: "center", padding: 16, background: "var(--bg)" }}>
      <h1 className="visually-hidden">Choose your screening</h1>
      <div style={{ display: "grid", gap: 20, width: "100%", maxWidth: 420 }}>
        <Link href="/register" className="btn btn-primary" style={big}>Live screening</Link>
        {c.VIRTUAL_SCREENING_ENABLED && <Link href="/register?mode=virtual" className="btn btn-primary" style={big}>Virtual screening</Link>}
      </div>
    </main>
  );
}
