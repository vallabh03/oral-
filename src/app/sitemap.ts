import type { MetadataRoute } from "next";
import { PAGES, absoluteUrl, type PageKey } from "@/content/site";

// Only canonical, indexable public URLs. Staff, intake, report and token routes are excluded (FR-SEO-03).
export const dynamic = "force-dynamic";

export default function sitemap(): MetadataRoute.Sitemap {
  return (Object.keys(PAGES) as PageKey[])
    .filter((k) => PAGES[k].indexable)
    .map((k) => ({
      url: absoluteUrl(PAGES[k].path),
      lastModified: new Date(PAGES[k].updated + "T00:00:00Z"),
      changeFrequency: k === "camps" ? "weekly" : "monthly",
      priority: k === "home" ? 1 : PAGES[k].parent ? 0.6 : 0.8,
    }));
}
