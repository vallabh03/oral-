import { FloatingContact, SiteFooter, SiteHeader } from "@/components/SiteChrome";
import { CookieConsent } from "@/components/client/CookieConsent";
import { ScrollUi } from "@/components/client/ScrollUi";
import { JsonLd } from "@/components/JsonLd";
import { organizationJsonLd, websiteJsonLd } from "@/lib/seo";
import { indexingEnabled } from "@/content/site";

export default function PublicLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      {!indexingEnabled() && (
        <div className="review-banner" role="note">Pre-launch preview — health content is pending clinical review.</div>
      )}
      <ScrollUi />
      <SiteHeader />
      <main id="main" tabIndex={-1}>{children}</main>
      <SiteFooter />
      <FloatingContact />
      <CookieConsent />
      <JsonLd data={[organizationJsonLd(), websiteJsonLd()]} />
    </>
  );
}
