import type { Metadata } from "next";

// Every staff route is private: never indexed, never cached by shared caches.
export const metadata: Metadata = {
  title: { default: "Staff workspace", template: "%s | DRIVE SAFE workspace" },
  robots: { index: false, follow: false, nocache: true },
  referrer: "same-origin",
};
export const dynamic = "force-dynamic";

export default function WorkspaceRoot({ children }: { children: React.ReactNode }) {
  return children;
}
