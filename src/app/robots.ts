import type { MetadataRoute } from "next";
import { absoluteUrl, indexingEnabled } from "@/content/site";

// robots.txt is a crawl hint only — private routes are protected by authentication, not by this file.
// /register and /search are crawlable so search engines can see their noindex directives.
export const dynamic = "force-dynamic";

export default function robots(): MetadataRoute.Robots {
  if (!indexingEnabled()) return { rules: [{ userAgent: "*", disallow: "/" }] };
  const disallow = ["/workspace", "/api/"];
  return {
    rules: [
      { userAgent: "*", allow: "/", disallow },
      // GEO: public programme content may be read by AI search crawlers; private routes stay excluded.
      { userAgent: ["GPTBot", "OAI-SearchBot", "ChatGPT-User", "ClaudeBot", "Claude-SearchBot", "PerplexityBot", "Google-Extended", "Applebot-Extended"], allow: "/", disallow },
    ],
    sitemap: absoluteUrl("/sitemap.xml"),
  };
}
