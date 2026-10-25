import { pageMetadata, webPageJsonLd } from "@/lib/seo";
import { JsonLd } from "@/components/JsonLd";
import { PageHeader, RelatedLinks } from "@/components/SiteChrome";
import { CookiePrefsButton } from "@/components/client/CookieConsent";

export const metadata = pageMetadata("cookies");

const ROWS = [
  { name: "cookie_prefs", type: "Essential", purpose: "Remembers your cookie choice", life: "180 days" },
  { name: "ds_session / __Host-ds_session", type: "Essential", purpose: "Staff sign-in session (staff workspace only)", life: "Up to 12 hours" },
  { name: "ds_intake / __Host-ds_intake", type: "Essential", purpose: "Keeps your registration session while you complete the questionnaire", life: "2 hours" },
  { name: "theme (local storage)", type: "Essential", purpose: "Remembers light or dark mode", life: "Until cleared" },
  { name: "utm (session storage)", type: "Analytics", purpose: "Campaign source for this visit, sent only with analytics consent", life: "This visit" },
];

export default function CookiesPage() {
  return (
    <>
      <JsonLd data={webPageJsonLd("cookies")} />
      <PageHeader page="cookies" eyebrow="Your choice, any time"><p className="lede">We use no advertising, retargeting or third-party tracking cookies.</p></PageHeader>
      <section className="section">
        <div className="container">
          <div className="table-wrap">
            <table className="data responsive">
              <caption className="visually-hidden">Cookies and storage used by this website</caption>
              <thead><tr><th scope="col">Name</th><th scope="col">Category</th><th scope="col">Purpose</th><th scope="col">Lifetime</th></tr></thead>
              <tbody>
                {ROWS.map((r) => (
                  <tr key={r.name}><td data-label="Name"><code>{r.name}</code></td><td data-label="Category">{r.type}</td><td data-label="Purpose">{r.purpose}</td><td data-label="Lifetime">{r.life}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
          <p style={{ marginTop: 24 }}><CookiePrefsButton className="btn btn-primary" /></p>
        </div>
      </section>
      <RelatedLinks page="cookies" />
    </>
  );
}
