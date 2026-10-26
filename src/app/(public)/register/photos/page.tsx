import type { Metadata } from "next";
import Link from "next/link";
import { VirtualPhotos } from "@/components/client/VirtualPhotos";
import { config } from "@/lib/server/config";

export const metadata: Metadata = { title: "Your mouth photos", robots: { index: false, follow: false } };

export default function PhotosPage() {
  return (
    <section className="section">
      <div className="container" style={{ maxWidth: 900 }}>
        <span className="eyebrow">Virtual screening</span>
        <h1>Your mouth photos</h1>
        {config().VIRTUAL_SCREENING_ENABLED ? (
          <>
            <p className="lede">Take or upload a photo of each area. A doctor will review them with your answers.</p>
            <VirtualPhotos />
          </>
        ) : (
          <p className="callout">Photo-based virtual screening is not open yet. <Link href="/contact">Contact us</Link> for help.</p>
        )}
      </div>
    </section>
  );
}
