import { expect, test } from "@playwright/test";

const PAGES = ["/", "/about", "/know-oral-cancer", "/programs", "/programs/drive-safe", "/programs/build-safe", "/get-help", "/healthcare-professionals", "/partner", "/impact", "/camps", "/faq", "/contact", "/privacy", "/cookies"];

test.describe("public website", () => {
  for (const path of PAGES) {
    test(`${path} renders server-side with SEO essentials and no errors`, async ({ page }) => {
      const errors: string[] = [];
      page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
      page.on("pageerror", (e) => errors.push(e.message));
      const res = await page.goto(path);
      expect(res?.status()).toBe(200);
      const html = await res!.text();
      // Core content is in the server HTML (crawlable without JS).
      expect(html).toMatch(/<h1[^>]*>/);
      await expect(page.locator("h1")).toHaveCount(1);
      await expect(page.locator('link[rel="canonical"]')).toHaveAttribute("href", path === "/" ? /^http:\/\/localhost:\d+\/?$/ : new RegExp(`${path}$`));
      await expect(page.locator('meta[name="description"]')).toHaveAttribute("content", /.{60,}/);
      await expect(page.locator('meta[property="og:image"]').first()).toHaveAttribute("content", /\/og\//);
      expect(await page.locator('script[type="application/ld+json"]').count()).toBeGreaterThan(0);
      expect(res!.headers()["content-security-policy"]).toContain("nonce-");
      expect(errors).toEqual([]);
    });
  }

  test("titles are unique across pages", async ({ page }) => {
    const titles = new Set<string>();
    for (const p of PAGES) {
      await page.goto(p);
      titles.add(await page.title());
    }
    expect(titles.size).toBe(PAGES.length);
  });

  test("skip link moves focus to main content", async ({ page, isMobile }) => {
    test.skip(!!isMobile, "keyboard test");
    await page.goto("/about");
    await page.keyboard.press("Tab");
    const skip = page.getByRole("link", { name: "Skip to main content" });
    await expect(skip).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(page.locator("#main")).toBeFocused();
  });

  test("cookie banner: essential only, then change preferences later", async ({ page }) => {
    await page.goto("/");
    const banner = page.getByRole("region", { name: "Cookie choices" });
    await expect(banner).toBeVisible();
    await banner.getByRole("button", { name: "Essential only" }).click();
    await expect(banner).toBeHidden();
    await expect(page.getByRole("status").filter({ hasText: "Only essential cookies" })).toBeVisible();
    await page.reload();
    await expect(page.getByRole("region", { name: "Cookie choices" })).toBeHidden();
    await page.getByRole("button", { name: "Cookie preferences" }).click();
    const dialog = page.getByRole("dialog", { name: "Cookie preferences" });
    await dialog.getByLabel("Analytics").check();
    await dialog.getByRole("button", { name: "Save preferences" }).click();
    const cookie = (await page.context().cookies()).find((c) => c.name === "cookie_prefs");
    expect(decodeURIComponent(cookie!.value)).toContain('"analytics":true');
  });

  test("no analytics request is sent before consent", async ({ page }) => {
    const sent: string[] = [];
    page.on("request", (r) => r.url().includes("/api/events") && sent.push(r.url()));
    await page.goto("/?utm_source=poster&utm_campaign=launch");
    await page.waitForTimeout(500);
    expect(sent).toHaveLength(0);
    await page.getByRole("button", { name: "Allow analytics" }).click();
    const req = page.waitForRequest((r) => r.url().includes("/api/events"));
    await page.goto("/camps");
    const body = (await req).postDataJSON();
    expect(body).toMatchObject({ name: "camp_info_viewed", path: "/camps", utm_source: "poster" });
    expect(Object.keys(body).sort()).toEqual(["name", "path", "utm_campaign", "utm_source"].sort());
  });

  test("dark mode toggle persists across reloads", async ({ page }) => {
    await page.emulateMedia({ colorScheme: "light" });
    await page.goto("/");
    await page.getByRole("button", { name: "Switch to dark mode" }).click();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
    await page.reload();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
    await page.getByRole("button", { name: "Switch to light mode" }).click();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  });

  test("site search finds public content and shows an empty state", async ({ page }) => {
    await page.goto("/search?q=warning+signs");
    await expect(page.getByRole("status")).toContainText("result");
    await expect(page.locator("main li.card").first()).toBeVisible();
    await page.goto("/search?q=zzqqxx");
    await expect(page.getByText("No results for “zzqqxx”")).toBeVisible();
  });

  test("FAQ items expand and collapse", async ({ page }) => {
    await page.goto("/faq");
    const first = page.locator("details").first();
    await expect(first).not.toHaveAttribute("open", "");
    await first.locator("summary").click();
    await expect(first).toHaveAttribute("open", "");
    await expect(first.locator(".answer")).toBeVisible();
  });

  test("custom 404 page offers safe links", async ({ page }) => {
    const res = await page.goto("/this-page-does-not-exist");
    expect(res?.status()).toBe(404);
    await expect(page.getByRole("heading", { name: "We couldn't find that page" })).toBeVisible();
    for (const name of ["Home", "Register", "Screening camps", "Support"]) await expect(page.getByRole("link", { name: new RegExp(name) }).first()).toBeVisible();
    expect(await page.content()).not.toMatch(/node_modules|stack|Error:/);
  });

  test("contact form: validation errors, then success state", async ({ page }) => {
    await page.goto("/contact");
    await page.getByRole("button", { name: "Send message" }).click();
    await expect(page.locator(".error-summary")).toContainText("Please fix");
    await page.getByLabel("Your name").fill("Asha Rao");
    await page.getByLabel("Email").fill("asha@example.test");
    await page.getByLabel(/^Message/).fill("We would like to host a screening camp at our depot.");
    await page.getByRole("button", { name: "Send message" }).click();
    await expect(page.getByRole("heading", { name: /Thank you/ })).toBeVisible();
  });

  test("back-to-top and scroll progress appear after scrolling", async ({ page }) => {
    await page.goto("/know-oral-cancer");
    await page.getByRole("button", { name: "Essential only" }).click();
    const btn = page.getByRole("button", { name: "Back to top" });
    await expect(btn).toBeHidden();
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await expect(btn).toBeVisible();
    await btn.click();
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBeLessThan(50);
  });

  test("copy link button gives feedback", async ({ page, context, browserName }) => {
    test.skip(browserName !== "chromium");
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);
    await page.goto("/faq");
    await page.getByRole("button", { name: "Copy link: Page link" }).click();
    await expect(page.getByRole("status").filter({ hasText: "copied" })).toBeVisible();
  });

  test("sitemap, robots, manifest, icons and share images are served", async ({ request }) => {
    const sitemap = await (await request.get("/sitemap.xml")).text();
    expect(sitemap).toContain("<loc>");
    expect(sitemap).not.toMatch(/workspace|register|api/);
    const robots = await (await request.get("/robots.txt")).text();
    expect(robots).toMatch(/Disallow: \/workspace/);
    expect(robots).toMatch(/Sitemap: .*sitemap\.xml/);
    expect((await request.get("/manifest.webmanifest")).ok()).toBe(true);
    for (const p of ["/favicon.ico", "/icon.png", "/apple-icon.png", "/images/logo.png", "/icons/icon-192.png", "/icons/icon-512.png"]) expect((await request.get(p)).status(), p).toBe(200);
    const og = await request.get("/og/home");
    expect(og.headers()["content-type"]).toBe("image/png");
  });

  test("images are served as AVIF/WebP and off-screen images lazy-load", async ({ page }) => {
    await page.goto("/programs");
    const img = page.locator(".card-media img").first();
    const srcset = await img.getAttribute("srcset");
    expect(srcset).toContain("/_next/image");
    const res = await page.request.get(srcset!.split(" ")[0]!, { headers: { accept: "image/avif,image/webp,*/*" } });
    expect(["image/avif", "image/webp"]).toContain(res.headers()["content-type"]);
    await expect(page.locator(".card-media img").last()).toHaveAttribute("loading", "lazy");
    // The header logo is above the fold, so it is not lazy-loaded.
    await expect(page.locator(".site-header .logo-chip img")).not.toHaveAttribute("loading", "lazy");
  });

  test("print stylesheet hides navigation and overlays", async ({ page }) => {
    await page.goto("/faq");
    await page.emulateMedia({ media: "print" });
    await expect(page.locator(".site-header")).toBeHidden();
    await expect(page.locator(".floating-contact")).toBeHidden();
    await expect(page.locator("h1")).toBeVisible();
  });

  test("reduced motion disables animations", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/");
    const anim = await page.locator(".fade-in").first().evaluate((el) => getComputedStyle(el).animationName);
    expect(anim).toBe("none");
    expect(await page.evaluate(() => getComputedStyle(document.documentElement).scrollBehavior)).toBe("auto");
  });
});
