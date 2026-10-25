import { describe, expect, it } from "vitest";
import sharp from "sharp";
import { processClinicalImage, stripJpeg, stripPng, stripWebp } from "@/lib/server/clinicalImage";

// Synthetic "clinical" texture: noisy, photo-like content (no real patient images).
const texture = (w = 640, h = 480) => sharp({ create: { width: w, height: h, channels: 3, background: "#c88", noise: { type: "gaussian", mean: 128, sigma: 50 } } });
const gps = { IFD0: { Make: "SyntheticPhoneCo", Model: "Model X", Orientation: "6" }, IFD3: { GPSLatitudeRef: "N", GPSLatitude: "17/1 23/1 0/1", GPSLongitudeRef: "E", GPSLongitude: "78/1 29/1 0/1" } };
const rawPixels = async (b: Buffer) => (await sharp(b).raw().toBuffer({ resolveWithObject: true })).data;

describe("clinical image metadata removal (lossless)", () => {
  it("removes GPS/device EXIF from JPEG, keeps orientation and every pixel", async () => {
    const src = await texture().jpeg({ quality: 92 }).withExif(gps).withMetadata({ orientation: 6 }).toBuffer();
    expect((await sharp(src).metadata()).orientation).toBe(6);
    const before = await sharp(src).metadata();
    expect(before.exif).toBeDefined();
    expect(src.includes(Buffer.from("SyntheticPhoneCo"))).toBe(true);

    const out = stripJpeg(src);
    expect(out.removed).toContain("exif");
    expect(out.data.includes(Buffer.from("SyntheticPhoneCo"))).toBe(false);
    expect(out.data.includes(Buffer.from("GPS"))).toBe(false);
    const after = await sharp(out.data).metadata();
    expect(after.orientation).toBe(6); // display orientation preserved
    expect(after.exif!.length).toBeLessThan(64); // only the Orientation tag remains
    expect((await rawPixels(out.data)).equals(await rawPixels(src))).toBe(true); // not re-encoded
  });

  it("removes text/EXIF chunks from PNG without touching image data", async () => {
    const src = await texture(300, 300).png().withExif(gps).withMetadata({}).toBuffer();
    const tagged = Buffer.concat([src.subarray(0, src.length - 12), pngChunk("tEXt", Buffer.from("Comment\0phone-serial-123")), src.subarray(src.length - 12)]);
    const out = stripPng(tagged);
    expect(out.data.includes(Buffer.from("phone-serial-123"))).toBe(false);
    expect((await rawPixels(out.data)).equals(await rawPixels(tagged))).toBe(true);
  });

  it("removes EXIF from WebP and clears the container flags", async () => {
    const src = await texture(300, 300).webp({ quality: 90 }).withExif(gps).toBuffer();
    expect(src.includes(Buffer.from("SyntheticPhoneCo"))).toBe(true);
    const out = stripWebp(src);
    expect(out.data.includes(Buffer.from("SyntheticPhoneCo"))).toBe(false);
    expect((await sharp(out.data).metadata()).exif).toBeUndefined();
    expect((await rawPixels(out.data)).equals(await rawPixels(src))).toBe(true);
  });

  it("validates real content, size and integrity", async () => {
    const ok = await processClinicalImage(await texture().jpeg().toBuffer());
    expect(ok.mime).toBe("image/jpeg");
    expect((await sharp(ok.preview).metadata()).width).toBeLessThanOrEqual(480);
    const full = await texture().jpeg().toBuffer();
    await expect(processClinicalImage(full.subarray(0, Math.floor(full.length / 2)))).rejects.toMatchObject({ status: 415 }); // truncated
    await expect(processClinicalImage(Buffer.from("<svg xmlns='http://www.w3.org/2000/svg'/>"))).rejects.toMatchObject({ status: 415 });
    await expect(processClinicalImage(await texture(100, 100).jpeg().toBuffer())).rejects.toMatchObject({ status: 400 }); // too small
  });
});

function pngChunk(type: string, data: Buffer): Buffer {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "latin1"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body) >>> 0);
  return Buffer.concat([len, body, crc]);
}
function crc32(buf: Buffer): number {
  let c = ~0;
  for (const b of buf) {
    c ^= b;
    for (let k = 0; k < 8; k++) c = c & 1 ? (c >>> 1) ^ 0xedb88320 : c >>> 1;
  }
  return ~c;
}
