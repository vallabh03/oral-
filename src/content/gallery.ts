// Photos for the public gallery page (camps, awareness sessions, partner events).
// The page is hidden until GALLERY_ENABLED=true. Add only photos the programme owns and has
// written permission to publish: no participants' faces without signed media consent, and never
// clinical or mouth photographs.

export type GalleryItem = { src: string; alt: string; caption: string; date?: string };

/** Add items here, with files in public/gallery/. Newest first. */
export const GALLERY: GalleryItem[] = [];

export function galleryEnabled(): boolean {
  return process.env.GALLERY_ENABLED === "true";
}
