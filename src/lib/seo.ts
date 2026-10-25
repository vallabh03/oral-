import type { Metadata } from "next";
import { PAGES, SITE, absoluteUrl, indexingEnabled, type PageKey } from "@/content/site";

/** Unique title, description, self-canonical and Open Graph/Twitter metadata per page (FR-SEO-01/02/05). */
export function pageMetadata(key: PageKey): Metadata {
  const p = PAGES[key];
  const url = absoluteUrl(p.path);
  const image = { url: absoluteUrl(`/og/${key}`), width: 1200, height: 630, alt: `${SITE.name} — ${p.ogTitle ?? p.label}` };
  return {
    title: key === "home" ? { absolute: `${p.title} | ${SITE.shortName}` } : p.title,
    description: p.description,
    alternates: { canonical: url },
    robots: p.indexable && indexingEnabled() ? { index: true, follow: true } : { index: false, follow: true },
    openGraph: { type: "website", url, title: p.title, description: p.description, siteName: SITE.name, locale: SITE.locale, images: [image] },
    twitter: { card: "summary_large_image", title: p.title, description: p.description, images: [image.url] },
  };
}

export function breadcrumbTrail(key: PageKey): { name: string; path: string }[] {
  const trail: { name: string; path: string }[] = [];
  let cur: PageKey | undefined = key;
  while (cur) {
    trail.unshift({ name: PAGES[cur].label, path: PAGES[cur].path });
    cur = PAGES[cur].parent;
  }
  if (key !== "home") trail.unshift({ name: PAGES.home.label, path: "/" });
  return trail;
}

export function organizationJsonLd() {
  return {
    "@context": "https://schema.org",
    "@type": "NGO",
    "@id": absoluteUrl("/#organization"),
    name: SITE.name,
    alternateName: SITE.shortName,
    slogan: SITE.tagline,
    url: absoluteUrl("/"),
    logo: absoluteUrl("/images/logo.png"),
    image: absoluteUrl("/icons/icon-512.png"),
    description: SITE.description,
    areaServed: [{ "@type": "State", name: "Telangana" }, { "@type": "City", name: "Hyderabad" }],
    founder: { "@type": "Person", name: SITE.founder.name, jobTitle: SITE.founder.role },
    knowsAbout: ["Oral cancer prevention", "Tobacco cessation", "Oral cancer screening", "Early detection of oral lesions"],
  };
}

export function websiteJsonLd() {
  return {
    "@context": "https://schema.org",
    "@type": "WebSite",
    "@id": absoluteUrl("/#website"),
    url: absoluteUrl("/"),
    name: SITE.name,
    inLanguage: "en-IN",
    publisher: { "@id": absoluteUrl("/#organization") },
  };
}

export function webPageJsonLd(key: PageKey, type: "WebPage" | "AboutPage" | "ContactPage" | "FAQPage" | "MedicalWebPage" | "CollectionPage" = "WebPage") {
  const p = PAGES[key];
  return {
    "@context": "https://schema.org",
    "@type": type,
    "@id": absoluteUrl(p.path) + "#webpage",
    url: absoluteUrl(p.path),
    name: p.title,
    description: p.description,
    inLanguage: "en-IN",
    dateModified: p.updated,
    isPartOf: { "@id": absoluteUrl("/#website") },
    breadcrumb: { "@id": absoluteUrl(p.path) + "#breadcrumb" },
    about: type === "MedicalWebPage" ? { "@type": "MedicalCondition", name: "Oral cancer", alternateName: "Mouth cancer" } : { "@id": absoluteUrl("/#organization") },
    publisher: { "@id": absoluteUrl("/#organization") },
  };
}

export function breadcrumbJsonLd(key: PageKey) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    "@id": absoluteUrl(PAGES[key].path) + "#breadcrumb",
    itemListElement: breadcrumbTrail(key).map((c, i) => ({ "@type": "ListItem", position: i + 1, name: c.name, item: absoluteUrl(c.path) })),
  };
}

/** One FAQPage entity (merged with the page's WebPage node) listing exactly the visible FAQs. */
export function faqJsonLd(items: { q: string; a: string }[]) {
  return {
    ...webPageJsonLd("faq"),
    "@type": "FAQPage",
    mainEntity: items.map((f) => ({ "@type": "Question", name: f.q, acceptedAnswer: { "@type": "Answer", text: f.a } })),
  };
}
