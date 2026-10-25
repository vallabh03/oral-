import fs from "node:fs";
import path from "node:path";
import { ImageResponse } from "next/og";
import { PAGES, SITE, type PageKey } from "@/content/site";

// Branded 1200×630 social share images per public page (FR-SEO-05). Static text only — never PHI.
export const dynamic = "force-static";
export function generateStaticParams() {
  return (Object.keys(PAGES) as PageKey[]).filter((k) => k !== "search" && k !== "register").map((slug) => ({ slug }));
}

export async function GET(_req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const page = PAGES[slug as PageKey];
  if (!page || slug === "search" || slug === "register") return new Response("Not found", { status: 404 });
  const heading = page.ogTitle ?? page.label;
  const emblem = `data:image/png;base64,${fs.readFileSync(path.join(process.cwd(), "public", "icons", "icon-512.png")).toString("base64")}`;
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "space-between", padding: 72, background: "linear-gradient(135deg, #0c2550 0%, #14366e 60%, #23498c 100%)", color: "#fff" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={emblem} width={96} height={96} alt="" style={{ borderRadius: 48, background: "#ffffff" }} />
          <div style={{ display: "flex", flexDirection: "column", fontSize: 30, fontWeight: 700, letterSpacing: 1 }}>
            <span>TELANGANA AGAINST</span>
            <span>ORAL CANCER</span>
          </div>
        </div>
        <div style={{ display: "flex", flexDirection: "column" }}>
          <div style={{ fontSize: heading.length > 32 ? 64 : 80, fontWeight: 800, lineHeight: 1.05 }}>{heading}</div>
          <div style={{ fontSize: 30, marginTop: 24, color: "#d6e0f5" }}>{SITE.tagline}</div>
        </div>
        <div style={{ display: "flex", height: 10, width: 220, background: "#c8264f", borderRadius: 5 }} />
      </div>
    ),
    { width: 1200, height: 630, headers: { "cache-control": "public, max-age=86400, immutable" } },
  );
}
