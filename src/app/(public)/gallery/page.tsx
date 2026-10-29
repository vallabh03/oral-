import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { GALLERY, galleryEnabled } from "@/content/gallery";

// Hidden until the programme approves the photos (GALLERY_ENABLED=true); never indexed before then.
export const metadata: Metadata = {
  title: "Gallery",
  description: "Photos from DRIVE SAFE screening camps and awareness sessions across Telangana.",
  robots: { index: false, follow: true },
};

export default function GalleryPage() {
  if (!galleryEnabled()) notFound();
  return (
    <>
      <div className="page-head">
        <div className="container">
          <span className="eyebrow">DRIVE SAFE</span>
          <h1>Gallery</h1>
          <p className="lede">Moments from our screening camps and awareness sessions across Telangana.</p>
        </div>
      </div>
      <section className="section">
        <div className="container">
          {GALLERY.length ? (
            <ul className="gallery-grid">
              {GALLERY.map((g) => (
                <li key={g.src} className="gallery-item">
                  <Image src={g.src} alt={g.alt} width={640} height={480} sizes="(min-width: 900px) 33vw, (min-width: 600px) 50vw, 100vw" />
                  <p className="gallery-cap">{g.caption}{g.date && <span className="hint"> · {g.date}</span>}</p>
                </li>
              ))}
            </ul>
          ) : (
            <div className="card" role="status">
              <p style={{ margin: 0 }}>Photos from our camps will appear here soon. <Link href="/camps">See upcoming screening camps</Link>.</p>
            </div>
          )}
        </div>
      </section>
    </>
  );
}
