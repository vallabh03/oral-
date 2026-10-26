import "server-only";
import sharp from "sharp";

// Basic photo-quality checks for patient-captured mouth images. They only help the patient take
// a usable photo (too dark, too bright, blurry); they never judge the clinical content and never
// replace the doctor's review, who can still mark any image as acceptable or ask for a retake.

export type QualityFlag = "too_dark" | "too_bright" | "blurry";
export type Quality = { brightness: number; sharpness: number; flags: QualityFlag[] };

export const QUALITY_LIMITS = { darkBelow: 45, brightAbove: 235, blurryBelow: 6 };

export const QUALITY_MESSAGES: Record<QualityFlag, string> = {
  too_dark: "This photo looks too dark. Move to a window or turn on a light, then retake it.",
  too_bright: "This photo looks too bright or washed out. Avoid pointing the flash or light straight at the camera.",
  blurry: "This photo looks blurry. Hold the phone steady, tap the screen to focus, then retake it.",
};

/**
 * Mean brightness (0–255) and sharpness = variance of the Laplacian (a standard focus measure),
 * computed in floating point on a fixed-size greyscale copy so scores are comparable.
 */
export async function assessQuality(image: Buffer): Promise<Quality> {
  const { data, info } = await sharp(image, { failOn: "none" }).rotate().resize(512, 512, { fit: "inside", withoutEnlargement: true }).greyscale().raw().toBuffer({ resolveWithObject: true });
  const w = info.width, h = info.height;
  let sum = 0;
  for (let i = 0; i < data.length; i++) sum += data[i]!;
  let n = 0, mean = 0, m2 = 0;
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      const lap = data[i - w]! + data[i + w]! + data[i - 1]! + data[i + 1]! - 4 * data[i]!;
      n++;
      const d = lap - mean;
      mean += d / n;
      m2 += d * (lap - mean);
    }
  }
  const brightness = Math.round(sum / data.length);
  const sharpness = Math.round((n > 1 ? m2 / (n - 1) : 0) * 10) / 10;
  const flags: QualityFlag[] = [];
  if (brightness < QUALITY_LIMITS.darkBelow) flags.push("too_dark");
  if (brightness > QUALITY_LIMITS.brightAbove) flags.push("too_bright");
  if (sharpness < QUALITY_LIMITS.blurryBelow) flags.push("blurry");
  return { brightness, sharpness, flags };
}
