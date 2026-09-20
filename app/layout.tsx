import type { Metadata } from "next";
import "./globals.css";
import { LanguageProvider } from "./language";
export const metadata: Metadata = {
  title: "Telangana Against Oral Cancer | DRIVE SAFE",
  description: "Consent-led screening and clinician-led care coordination.",
  icons: { icon: "/favicon.svg", shortcut: "/favicon.svg" },
};
export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <head><link rel="stylesheet" href="/fonts/indic.css" /></head>
      <body><LanguageProvider>{children}</LanguageProvider></body>
    </html>
  );
}
