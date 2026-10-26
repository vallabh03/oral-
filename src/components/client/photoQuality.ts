"use client";

// Instant, on-device photo checks so the patient can retake before uploading. Same measures as
// the server (mean brightness; variance of the Laplacian for focus). Advisory only.
export type ClientFlag = "too_dark" | "too_bright" | "blurry";
export const LIMITS = { darkBelow: 45, brightAbove: 235, blurryBelow: 6 };
export const FLAG_MESSAGES: Record<ClientFlag, string> = {
  too_dark: "This photo looks too dark. Move to a window or turn on a light, then retake it.",
  too_bright: "This photo looks too bright or washed out. Avoid pointing the flash or light straight at the camera.",
  blurry: "This photo looks blurry. Hold the phone steady, tap the screen to focus, then retake it.",
};

export async function checkPhoto(file: Blob): Promise<ClientFlag[]> {
  try {
    const bmp = await createImageBitmap(file);
    const scale = Math.min(1, 512 / Math.max(bmp.width, bmp.height));
    const w = Math.max(3, Math.round(bmp.width * scale));
    const h = Math.max(3, Math.round(bmp.height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) return [];
    ctx.drawImage(bmp, 0, 0, w, h);
    bmp.close();
    const rgba = ctx.getImageData(0, 0, w, h).data;
    const g = new Float32Array(w * h);
    let sum = 0;
    for (let i = 0, p = 0; p < g.length; i += 4, p++) {
      g[p] = 0.299 * rgba[i]! + 0.587 * rgba[i + 1]! + 0.114 * rgba[i + 2]!;
      sum += g[p]!;
    }
    let n = 0, mean = 0, m2 = 0;
    for (let y = 1; y < h - 1; y++) {
      for (let x = 1; x < w - 1; x++) {
        const i = y * w + x;
        const lap = g[i - w]! + g[i + w]! + g[i - 1]! + g[i + 1]! - 4 * g[i]!;
        n++;
        const d = lap - mean;
        mean += d / n;
        m2 += d * (lap - mean);
      }
    }
    const brightness = sum / g.length;
    const sharpness = n > 1 ? m2 / (n - 1) : 0;
    const flags: ClientFlag[] = [];
    if (brightness < LIMITS.darkBelow) flags.push("too_dark");
    if (brightness > LIMITS.brightAbove) flags.push("too_bright");
    if (sharpness < LIMITS.blurryBelow) flags.push("blurry");
    return flags;
  } catch {
    return []; // formats the browser cannot decode (e.g. HEIC) are checked on the server instead
  }
}
