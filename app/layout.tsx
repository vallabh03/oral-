import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = {
  title: "Hyderabad Against Oral Cancer | Care workspace",
  description: "Consent-led screening and clinician-led care coordination.",
  icons: { icon: "/favicon.svg", shortcut: "/favicon.svg" },
};
export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
