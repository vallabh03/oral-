import type { Metadata, Viewport } from "next";
import { headers } from "next/headers";
import { SITE, absoluteUrl } from "@/content/site";
import { ToastProvider } from "@/components/client/Toaster";
import { THEME_BOOTSTRAP } from "@/components/client/ThemeToggle";
import "./globals.css";

// System font stack (like the campaign site): zero font downloads, instant text rendering and
// native Telugu/Hindi/Urdu glyphs on participants' phones.

export const metadata: Metadata = {
  metadataBase: new URL(absoluteUrl("/")),
  title: { default: SITE.name, template: `%s | ${SITE.shortName}` },
  description: SITE.description,
  applicationName: SITE.name,
  manifest: "/manifest.webmanifest",
  formatDetection: { telephone: false },
  appleWebApp: { title: "TAOC", capable: true, statusBarStyle: "default" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#1b5f8c" },
    { media: "(prefers-color-scheme: dark)", color: "#0d1620" },
  ],
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // Reading the nonce makes every page render per-request, so the strict CSP nonce applies.
  const nonce = (await headers()).get("x-nonce") ?? undefined;
  return (
    <html lang="en-IN" suppressHydrationWarning>
      <head>
        <script nonce={nonce} dangerouslySetInnerHTML={{ __html: THEME_BOOTSTRAP }} />
      </head>
      <body>
        <a href="#main" className="skip-link">Skip to main content</a>
        <ToastProvider>{children}</ToastProvider>
      </body>
    </html>
  );
}
