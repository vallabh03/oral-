import "server-only";
import sharp from "sharp";
import { config } from "./config";
import { Errors } from "./errors";
import { Semaphore, SemaphoreFullError } from "./semaphore";
import { sha256 } from "./security/crypto";

// libvips is multi-threaded per operation; we parallelise across requests instead, so pin
// each operation to one thread and bound the number of concurrent operations.
sharp.concurrency(1);
sharp.cache(false);

export const PHOTO_MAX_DIM = 720;
export const THUMB_DIM = 160;
const MAX_INPUT_PIXELS = 40_000_000;

const g = globalThis as unknown as { __photoGate?: Semaphore };
export function photoGate(): Semaphore {
  return (g.__photoGate ??= new Semaphore(config().photoConcurrency, config().PHOTO_QUEUE_LIMIT));
}

/** Detects the real image type from magic bytes — the client-declared MIME is not trusted. */
export function sniffImageType(buf: Buffer): "jpeg" | "png" | "webp" | null {
  if (buf.length < 12) return null;
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "jpeg";
  if (buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "png";
  if (buf.subarray(0, 4).toString("ascii") === "RIFF" && buf.subarray(8, 12).toString("ascii") === "WEBP") return "webp";
  return null;
}

export type ProcessedPhoto = {
  full: Buffer;
  thumb: Buffer;
  width: number;
  height: number;
  sha256: string;
};

/**
 * Re-encodes an untrusted upload: auto-orients, strips all metadata (EXIF/GPS), bounds the
 * size, and produces a WebP full image plus a small WebP thumbnail used by record lists.
 */
export async function processPhoto(input: Buffer): Promise<ProcessedPhoto> {
  if (input.length > config().PHOTO_MAX_UPLOAD_BYTES) throw Errors.tooLarge();
  if (!sniffImageType(input)) throw Errors.unsupported("Upload a JPEG, PNG or WebP photo.");
  try {
    return await photoGate().run(async () => {
      const base = sharp(input, { limitInputPixels: MAX_INPUT_PIXELS, failOn: "error" }).rotate();
      const meta = await base.metadata();
      if (!meta.width || !meta.height || meta.width < 64 || meta.height < 64) throw Errors.badRequest("The photo is too small. Please retake it.");
      const fullOut = await base
        .clone()
        .resize(PHOTO_MAX_DIM, PHOTO_MAX_DIM, { fit: "inside", withoutEnlargement: true })
        .webp({ quality: 80, effort: 3 })
        .toBuffer({ resolveWithObject: true });
      const thumb = await sharp(fullOut.data).resize(THUMB_DIM, THUMB_DIM, { fit: "cover", position: "attention" }).webp({ quality: 70, effort: 3 }).toBuffer();
      return { full: fullOut.data, thumb, width: fullOut.info.width, height: fullOut.info.height, sha256: sha256(fullOut.data) };
    });
  } catch (e) {
    if (e instanceof SemaphoreFullError) throw Errors.busy(2);
    if (e instanceof Error && /Input buffer|unsupported image|corrupt|VipsJpeg|pngload|webpload|pixel limit/i.test(e.message)) {
      throw Errors.unsupported("That photo could not be read. Please retake it.");
    }
    throw e;
  }
}
