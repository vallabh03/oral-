/**
 * SEO release gate (FR-SEO-13): crawls a running build and checks crawlability, indexability,
 * metadata, canonicals, headings, JSON-LD, internal links, sitemap/robots, image formats and
 * private-route protection. Usage: start the app, then `SEO_BASE=http://localhost:3000 npm run audit:seo`.
 */
const BASE = (process.env.SEO_BASE ?? "http://localhost:3000").replace(/\/$/, "");
type Issue = { severity: "high" | "medium" | "low"; url: string; issue: string };
const issues: Issue[] = [];
const add = (severity: Issue["severity"], url: string, issue: string) => issues.push({ severity, url, issue });

const attr = (html: string, re: RegExp) => html.match(re)?.[1]?.trim() ?? null;

async function main() {
  const sitemap = await (await fetch(`${BASE}/sitemap.xml`)).text();
  const urls = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]!.replace(/^https?:\/\/[^/]+/, BASE));
  if (!urls.length) add("high", "/sitemap.xml", "Sitemap has no URLs");
  const robots = await (await fetch(`${BASE}/robots.txt`)).text();
  if (!/Sitemap:/i.test(robots)) add("high", "/robots.txt", "robots.txt does not reference the sitemap");
  for (const p of ["/workspace", "/api/"]) if (!robots.includes(`Disallow: ${p}`)) add("medium", "/robots.txt", `Missing Disallow: ${p}`);

  const titles = new Map<string, string>();
  const descriptions = new Map<string, string>();
  const internal = new Set<string>();
  for (const url of urls) {
    const res = await fetch(url, { redirect: "manual" });
    if (res.status !== 200) {
      add("high", url, `Sitemap URL returns ${res.status}`);
      continue;
    }
    const html = await res.text();
    const path = new URL(url).pathname;
    const title = attr(html, /<title>([^<]*)<\/title>/);
    const desc = attr(html, /<meta name="description" content="([^"]*)"/);
    const canonical = attr(html, /<link rel="canonical" href="([^"]*)"/);
    const robotsMeta = attr(html, /<meta name="robots" content="([^"]*)"/);
    const h1s = (html.match(/<h1[\s>]/g) ?? []).length;
    if (!title) add("high", path, "Missing <title>");
    else if (title.length > 70 + 40) add("low", path, `Long title (${title.length} chars)`);
    if (title && titles.has(title)) add("high", path, `Duplicate title with ${titles.get(title)}`);
    if (title) titles.set(title, path);
    if (!desc) add("high", path, "Missing meta description");
    else if (desc.length < 70 || desc.length > 170) add("low", path, `Meta description length ${desc.length}`);
    if (desc && descriptions.has(desc)) add("medium", path, `Duplicate description with ${descriptions.get(desc)}`);
    if (desc) descriptions.set(desc, path);
    if (!canonical) add("high", path, "Missing canonical");
    else if (new URL(canonical).pathname.replace(/\/$/, "") !== path.replace(/\/$/, "")) add("high", path, `Canonical points elsewhere: ${canonical}`);
    if (robotsMeta && /noindex/.test(robotsMeta)) add("high", path, "Indexable sitemap URL is noindex");
    if (h1s !== 1) add("medium", path, `Expected one <h1>, found ${h1s}`);
    if (!/property="og:image"/.test(html)) add("medium", path, "Missing og:image");
    if (!/name="twitter:card"/.test(html)) add("low", path, "Missing twitter:card");
    if (!/<html lang="/.test(html)) add("medium", path, "Missing html lang");
    for (const m of html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)) {
      try {
        const data = JSON.parse(m[1]!.replace(/\\u003c/g, "<"));
        for (const node of Array.isArray(data) ? data : [data]) if (!node["@context"] || !node["@type"]) add("medium", path, "JSON-LD node missing @context/@type");
      } catch {
        add("high", path, "Invalid JSON-LD");
      }
    }
    if (!/application\/ld\+json/.test(html)) add("low", path, "No structured data");
    for (const img of html.matchAll(/<img [^>]*>/g)) if (!/ alt="/.test(img[0])) add("medium", path, "Image without alt attribute");
    for (const a of html.matchAll(/href="(\/[^"#?]*)/g)) internal.add(a[1]!);
  }

  for (const link of internal) {
    if (/^\/(_next|api|icons|images|og)\//.test(link) || /\.(png|svg|ico|webmanifest|xml|txt)$/.test(link)) continue;
    const r = await fetch(BASE + link, { redirect: "manual" });
    if (r.status >= 400) add("high", link, `Broken internal link (${r.status})`);
  }

  for (const p of ["/workspace/login", "/register", "/workspace/patients"]) {
    const r = await fetch(BASE + p, { redirect: "manual" });
    if (!/noindex/.test(r.headers.get("x-robots-tag") ?? "")) add("high", p, "Private route without X-Robots-Tag noindex");
    if (urls.some((u) => new URL(u).pathname === p)) add("high", p, "Private route listed in sitemap");
  }

  const home = await (await fetch(BASE + "/")).text();
  const nextImg = home.match(/\/_next\/image\?url=[^"\s]+/)?.[0]?.replace(/&amp;/g, "&");
  if (nextImg) {
    const r = await fetch(BASE + nextImg, { headers: { accept: "image/avif,image/webp,*/*" } });
    if (!/image\/(avif|webp)/.test(r.headers.get("content-type") ?? "")) add("medium", "/", "Images not served as AVIF/WebP");
  }

  const order = { high: 0, medium: 1, low: 2 };
  issues.sort((a, b) => order[a.severity] - order[b.severity]);
  console.log(`SEO audit of ${urls.length} URLs and ${internal.size} internal links at ${BASE}`);
  if (!issues.length) console.log("No issues found.");
  for (const i of issues) console.log(`[${i.severity.toUpperCase()}] ${i.url} — ${i.issue}`);
  if (issues.some((i) => i.severity === "high")) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
