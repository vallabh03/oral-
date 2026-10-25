import { FAQS, PAGES, PROGRAMS, WARNING_SIGNS, type PageKey } from "./site";

// Public site-search index: built only from public page content. Participant records are
// never indexed or queried here (FR-PUB-05).
export type SearchDoc = { title: string; url: string; text: string; kind: "Page" | "FAQ" | "Programme" };

export const SEARCH_INDEX: SearchDoc[] = [
  ...(Object.keys(PAGES) as PageKey[]).filter((k) => PAGES[k].indexable).map((k) => ({ title: PAGES[k].title, url: PAGES[k].path, text: PAGES[k].description, kind: "Page" as const })),
  ...FAQS.map((f, i) => ({ title: f.q, url: `/faq#q${i + 1}`, text: f.a, kind: "FAQ" as const })),
  ...PROGRAMS.map((p) => ({ title: p.name, url: `/programs/${p.key}`, text: `${p.audience}. ${p.summary}`, kind: "Programme" as const })),
  ...WARNING_SIGNS.map((w) => ({ title: `Warning sign: ${w.title}`, url: "/know-oral-cancer#warning-signs", text: w.detail, kind: "Page" as const })),
];

export function searchSite(q: string, limit = 20): SearchDoc[] {
  const terms = q.toLowerCase().normalize("NFKC").split(/\s+/).filter((t) => t.length > 1).slice(0, 8);
  if (!terms.length) return [];
  return SEARCH_INDEX.map((d) => {
    const title = d.title.toLowerCase();
    const text = d.text.toLowerCase();
    let score = 0;
    for (const t of terms) {
      if (title.includes(t)) score += 3;
      if (text.includes(t)) score += 1;
    }
    return { d, score };
  })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((x) => x.d);
}
