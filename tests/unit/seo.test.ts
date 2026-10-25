import { describe, expect, it } from "vitest";
import { PAGES, FAQS, type PageKey } from "@/content/site";
import { breadcrumbJsonLd, faqJsonLd, pageMetadata } from "@/lib/seo";
import sitemap from "@/app/sitemap";
import robots from "@/app/robots";
import { searchSite, SEARCH_INDEX } from "@/content/search";

const keys = Object.keys(PAGES) as PageKey[];
const indexable = keys.filter((k) => PAGES[k].indexable);

describe("SEO metadata", () => {
  it("gives every page a unique title and description of sensible length", () => {
    const titles = keys.map((k) => PAGES[k].title);
    const descs = keys.map((k) => PAGES[k].description);
    expect(new Set(titles).size).toBe(titles.length);
    expect(new Set(descs).size).toBe(descs.length);
    for (const k of indexable) {
      expect(PAGES[k].title.length, k).toBeLessThanOrEqual(90);
      expect(PAGES[k].description.length, k).toBeGreaterThanOrEqual(70);
      expect(PAGES[k].description.length, k).toBeLessThanOrEqual(170);
    }
  });
  it("sets absolute self-canonicals, Open Graph images and robots per page", () => {
    for (const k of keys) {
      const m = pageMetadata(k);
      expect(String(m.alternates?.canonical)).toBe(`http://localhost:3000${PAGES[k].path === "/" ? "/" : PAGES[k].path}`);
      expect(JSON.stringify(m.openGraph)).toContain(`/og/${k}`);
      expect(m.robots).toEqual(PAGES[k].indexable ? { index: true, follow: true } : { index: false, follow: true });
    }
  });
  it("builds breadcrumbs that end at the current page", () => {
    const b = breadcrumbJsonLd("drive-safe");
    expect(b.itemListElement.map((i) => i.name)).toEqual(["Home", "Programmes", "DRIVE SAFE"]);
  });
  it("marks up exactly the visible FAQs", () => {
    expect(faqJsonLd(FAQS).mainEntity).toHaveLength(FAQS.length);
  });
  it("links every indexable page to related pages that exist", () => {
    for (const k of indexable) for (const r of PAGES[k].related ?? []) expect(PAGES[r], `${k} → ${r}`).toBeDefined();
  });
});

describe("crawl controls", () => {
  it("sitemap lists only canonical public URLs", () => {
    const urls = sitemap().map((u) => u.url);
    expect(urls).toHaveLength(indexable.length);
    for (const u of urls) expect(u).not.toMatch(/workspace|register|api|search|token|report/);
  });
  it("robots.txt points to the sitemap and disallows private areas", () => {
    const r = robots();
    expect(r.sitemap).toBe("http://localhost:3000/sitemap.xml");
    const rules = Array.isArray(r.rules) ? r.rules : [r.rules];
    for (const rule of rules) expect(rule.disallow).toEqual(expect.arrayContaining(["/workspace", "/api/"]));
  });
});

describe("site search", () => {
  it("indexes only public content", () => {
    for (const d of SEARCH_INDEX) expect(d.url).not.toMatch(/workspace|api|register\/status/);
  });
  it("finds relevant pages", () => {
    expect(searchSite("warning signs")[0]?.url).toMatch(/know-oral-cancer|faq/);
    expect(searchSite("quit tobacco").length).toBeGreaterThan(0);
    expect(searchSite("")).toEqual([]);
  });
});

describe("pre-approval indexing gate", () => {
  it("keeps the whole site out of search until INDEXING_ENABLED=true", () => {
    process.env.INDEXING_ENABLED = "false";
    try {
      expect(pageMetadata("home").robots).toEqual({ index: false, follow: true });
      expect(robots().rules).toEqual([{ userAgent: "*", disallow: "/" }]);
    } finally {
      process.env.INDEXING_ENABLED = "true";
    }
  });
});
