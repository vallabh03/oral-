import "server-only";
import sharp from "sharp";
import { config } from "./config";
import { Errors } from "./errors";
import { Semaphore, SemaphoreFullError } from "./semaphore";
import { sniffImageType } from "./images";
import { sha256 } from "./security/crypto";

// Clinical lesion images (PRD v1.2 §2). Unlike identity photos these are NOT re-encoded: the
// stored file keeps every original pixel. Metadata is removed at the byte level using
// allow-lists (only image-data and rendering-critical structures survive). JPEG orientation is
// preserved by writing back a minimal EXIF block that contains only the Orientation tag.

export type StrippedImage = { data: Buffer; type: "jpeg" | "png" | "webp"; removed: string[] };

// Bounded decode cost: 40 MP covers modern phone cameras; a dedicated small gate keeps clinical
// uploads from exhausting memory (each decode can need several hundred MB).
const MAX_PIXELS = 40_000_000;
const g = globalThis as unknown as { __clinicalGate?: Semaphore };
const clinicalGate = () => (g.__clinicalGate ??= new Semaphore(2, 16));

const damaged = (kind: string) => Errors.unsupported(`That ${kind} file is damaged or incomplete. Retake the photo.`);

// ---------- JPEG ----------
function readExifOrientation(app1: Buffer): number | null {
  if (app1.length < 14 || app1.toString("latin1", 0, 6) !== "Exif\0\0") return null;
  const t = app1.subarray(6);
  const le = t.toString("latin1", 0, 2) === "II";
  const u16 = (o: number) => (le ? t.readUInt16LE(o) : t.readUInt16BE(o));
  const u32 = (o: number) => (le ? t.readUInt32LE(o) : t.readUInt32BE(o));
  try {
    const ifd = u32(4);
    const n = Math.min(u16(ifd), 512);
    for (let i = 0; i < n; i++) {
      const e = ifd + 2 + i * 12;
      if (u16(e) === 0x0112) {
        const v = u16(e + 8);
        return v >= 1 && v <= 8 ? v : null;
      }
    }
  } catch {
    return null;
  }
  return null;
}

/** A minimal APP1 segment carrying only the EXIF Orientation tag (no GPS, device or dates). */
function orientationOnlyApp1(orientation: number): Buffer {
  const tiff = Buffer.alloc(26);
  tiff.write("MM", 0, "latin1");
  tiff.writeUInt16BE(42, 2);
  tiff.writeUInt32BE(8, 4);
  tiff.writeUInt16BE(1, 8);
  tiff.writeUInt16BE(0x0112, 10);
  tiff.writeUInt16BE(3, 12);
  tiff.writeUInt32BE(1, 14);
  tiff.writeUInt16BE(orientation, 18);
  tiff.writeUInt32BE(0, 22);
  const payload = Buffer.concat([Buffer.from("Exif\0\0", "latin1"), tiff]);
  const head = Buffer.alloc(4);
  head.writeUInt16BE(0xffe1, 0);
  head.writeUInt16BE(payload.length + 2, 2);
  return Buffer.concat([head, payload]);
}

// Markers that define how the image decodes. Everything else (APPn except JFIF/ICC/Adobe, COM,
// and anything after EOI such as MPF secondary images, gain maps or vendor trailers) is dropped.
const JPEG_KEEP = new Set([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf, 0xc4, 0xcc, 0xdb, 0xdd, 0xdc, 0xde, 0xdf]);

export function stripJpeg(buf: Buffer): StrippedImage {
  if (buf[0] !== 0xff || buf[1] !== 0xd8) throw Errors.unsupported("That file is not a valid JPEG image.");
  const out: Buffer[] = [buf.subarray(0, 2)];
  const removed = new Set<string>();
  let orientation: number | null = null;
  let insertAt = 1;
  let sawEoi = false;
  let i = 2;
  while (i < buf.length) {
    if (buf[i] !== 0xff) throw damaged("JPEG");
    while (buf[i + 1] === 0xff) i++; // fill bytes before a marker are legal
    const marker = buf[i + 1];
    if (marker === undefined) throw damaged("JPEG");
    if (marker === 0xd9) {
      out.push(buf.subarray(i, i + 2));
      sawEoi = true;
      if (i + 2 < buf.length) removed.add("trailing_data"); // e.g. embedded secondary images with their own EXIF/GPS
      break;
    }
    if (i + 4 > buf.length) throw damaged("JPEG");
    const len = buf.readUInt16BE(i + 2);
    const end = i + 2 + len;
    if (len < 2 || end > buf.length) throw damaged("JPEG");
    const seg = buf.subarray(i, end);
    const payload = buf.subarray(i + 4, end);

    if (marker === 0xda) {
      // Start of scan: copy the header, then the entropy-coded data up to the next real marker
      // (FF00 is a stuffed byte, FFD0–FFD7 are restart markers — both are scan data).
      let j = end;
      while (j < buf.length) {
        if (buf[j] === 0xff) {
          const n = buf[j + 1];
          if (n === undefined) throw damaged("JPEG");
          if (n === 0x00 || (n >= 0xd0 && n <= 0xd7) || n === 0xff) { j += n === 0xff ? 1 : 2; continue; }
          break;
        }
        j++;
      }
      if (j >= buf.length) throw damaged("JPEG");
      out.push(buf.subarray(i, j));
      i = j;
      continue; // parse following segments (between progressive scans) with the same rules
    }

    if (marker === 0xe0) {
      // Keep the JFIF header only; JFXX extension segments carry embedded thumbnails.
      if (payload.toString("latin1", 0, 5) === "JFIF\0") { out.push(seg); insertAt = out.length; } else removed.add("jfxx");
    } else if (marker === 0xe1) {
      const isExif = payload.toString("latin1", 0, 6) === "Exif\0\0";
      if (isExif) orientation = orientation ?? readExifOrientation(payload);
      removed.add(isExif ? "exif" : "xmp");
    } else if (marker === 0xe2) {
      // ICC colour profiles affect how the clinical image renders: keep. Drop MPF and others.
      if (payload.toString("latin1", 0, 12) === "ICC_PROFILE\0") out.push(seg); else removed.add(payload.toString("latin1", 0, 3) === "MPF" ? "mpf" : "app2");
    } else if (marker === 0xee) {
      if (payload.toString("latin1", 0, 5) === "Adobe") out.push(seg); else removed.add("app14");
    } else if (JPEG_KEEP.has(marker)) {
      out.push(seg);
    } else {
      removed.add(marker === 0xfe ? "comment" : marker === 0xed ? "iptc" : `marker_${marker.toString(16)}`);
    }
    i = end;
  }
  if (!sawEoi) throw damaged("JPEG");
  if (orientation && orientation !== 1) out.splice(insertAt, 0, orientationOnlyApp1(orientation));
  return { data: Buffer.concat(out), type: "jpeg", removed: [...removed] };
}

// ---------- PNG (allow-list) ----------
const PNG_SIG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const PNG_KEEP = new Set(["IHDR", "PLTE", "IDAT", "IEND", "tRNS", "gAMA", "cHRM", "sRGB", "iCCP", "pHYs", "sBIT"]);

export function stripPng(buf: Buffer): StrippedImage {
  if (!buf.subarray(0, 8).equals(PNG_SIG)) throw Errors.unsupported("That file is not a valid PNG image.");
  const out: Buffer[] = [PNG_SIG];
  const removed = new Set<string>();
  let i = 8;
  let sawEnd = false;
  while (i + 12 <= buf.length) {
    const len = buf.readUInt32BE(i);
    const type = buf.toString("latin1", i + 4, i + 8);
    const end = i + 12 + len;
    if (end > buf.length) throw damaged("PNG");
    if (PNG_KEEP.has(type)) out.push(buf.subarray(i, end));
    else removed.add(type);
    i = end;
    if (type === "IEND") { sawEnd = true; break; }
  }
  if (!sawEnd) throw damaged("PNG");
  if (i < buf.length) removed.add("trailing_data");
  return { data: Buffer.concat(out), type: "png", removed: [...removed] };
}

// ---------- WebP (allow-list) ----------
const WEBP_KEEP = new Set(["VP8 ", "VP8L", "VP8X", "ALPH", "ICCP", "ANIM", "ANMF"]);

export function stripWebp(buf: Buffer): StrippedImage {
  if (buf.toString("latin1", 0, 4) !== "RIFF" || buf.toString("latin1", 8, 12) !== "WEBP") throw Errors.unsupported("That file is not a valid WebP image.");
  const riffEnd = Math.min(buf.length, 8 + buf.readUInt32LE(4));
  const chunks: Buffer[] = [];
  const removed = new Set<string>();
  let i = 12;
  while (i + 8 <= riffEnd) {
    const fourcc = buf.toString("latin1", i, i + 4);
    const size = buf.readUInt32LE(i + 4);
    const end = i + 8 + size + (size % 2);
    if (i + 8 + size > riffEnd) throw damaged("WebP");
    if (WEBP_KEEP.has(fourcc)) {
      const chunk = Buffer.from(buf.subarray(i, Math.min(end, riffEnd)));
      if (fourcc === "VP8X") chunk[8] = chunk[8]! & ~0x0c; // clear EXIF (0x08) and XMP (0x04) flags
      chunks.push(chunk);
    } else {
      removed.add(fourcc.trim().toLowerCase());
    }
    i = end;
  }
  if (riffEnd < buf.length) removed.add("trailing_data");
  const body = Buffer.concat(chunks);
  const head = Buffer.alloc(12);
  head.write("RIFF", 0, "latin1");
  head.writeUInt32LE(body.length + 4, 4);
  head.write("WEBP", 8, "latin1");
  return { data: Buffer.concat([head, body]), type: "webp", removed: [...removed] };
}

export function stripMetadata(buf: Buffer): StrippedImage {
  const t = sniffImageType(buf);
  if (t === "jpeg") return stripJpeg(buf);
  if (t === "png") return stripPng(buf);
  if (t === "webp") return stripWebp(buf);
  throw Errors.unsupported("Upload a JPEG, PNG or WebP image. On iPhone, set Camera › Formats to “Most Compatible”.");
}

export type ProcessedClinicalImage = {
  original: Buffer;
  mime: "image/jpeg" | "image/png" | "image/webp";
  ext: "jpg" | "png" | "webp";
  preview: Buffer;
  width: number;
  height: number;
  sha256: string;
  removed: string[];
};

/**
 * Validates and prepares an untrusted clinical upload: size limit → real type from content →
 * lossless metadata removal → full decode while building the preview (rejects corrupt or
 * truncated files without holding a full raw bitmap in memory).
 */
export async function processClinicalImage(input: Buffer): Promise<ProcessedClinicalImage> {
  if (input.length > config().CLINICAL_IMAGE_MAX_BYTES) throw Errors.tooLarge();
  const stripped = stripMetadata(input);
  try {
    return await clinicalGate().run(async () => {
      const meta = await sharp(stripped.data, { limitInputPixels: MAX_PIXELS }).metadata();
      if (meta.format !== stripped.type) throw Errors.unsupported("The file content does not match its image type.");
      if (!meta.width || !meta.height || meta.width < 200 || meta.height < 200) throw Errors.badRequest("The image is too small for clinical review. Take a closer, sharper photo.");
      // Producing the preview decodes every scanline; failOn "truncated" rejects incomplete data.
      const preview = await sharp(stripped.data, { limitInputPixels: MAX_PIXELS, failOn: "truncated", sequentialRead: true })
        .rotate()
        .resize(480, 480, { fit: "inside", withoutEnlargement: true })
        .webp({ quality: 75 })
        .toBuffer();
      const mime = `image/${stripped.type}` as ProcessedClinicalImage["mime"];
      return { original: stripped.data, mime, ext: stripped.type === "jpeg" ? "jpg" : stripped.type, preview, width: meta.width, height: meta.height, sha256: sha256(stripped.data), removed: stripped.removed };
    });
  } catch (e) {
    if (e instanceof SemaphoreFullError) throw Errors.busy(5);
    if (e instanceof Error && /corrupt|truncat|premature|bad huffman|unsupported image|Input buffer|pixel limit|vips|extraneous/i.test(e.message)) {
      throw Errors.unsupported("That image file is damaged or could not be read. Retake the photo.");
    }
    throw e;
  }
}
