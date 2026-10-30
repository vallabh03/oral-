/**
 * Generates favicon/app icons and placeholder campaign illustrations from SVG sources.
 * Outputs are committed; next/image serves the illustrations as AVIF/WebP with srcset.
 * Replace the illustrations with approved programme photography before launch.
 */
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";

const root = path.resolve(import.meta.dirname, "..");
const out = (...p: string[]) => path.join(root, ...p);
fs.mkdirSync(out("public", "icons"), { recursive: true });
fs.mkdirSync(out("public", "images"), { recursive: true });

// (legacy placeholder mark, kept for reference)
export const mark = (bg = "#0f5e57", pad = 0) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${-pad} ${-pad} ${48 + pad * 2} ${48 + pad * 2}">
  ${pad ? `<rect x="${-pad}" y="${-pad}" width="${48 + pad * 2}" height="${48 + pad * 2}" fill="${bg}"/>` : ""}
  <circle cx="24" cy="24" r="22" fill="${bg}"/>
  <path d="M12 30c4-9 9-13 12-13s8 4 12 13" fill="none" stroke="#fff" stroke-width="3.5" stroke-linecap="round"/>
  <circle cx="24" cy="12" r="3.5" fill="#e0943f"/></svg>`;

/** Minimal ICO writer with embedded PNG frames (supported by all modern browsers). */
function ico(pngs: { size: number; data: Buffer }[]): Buffer {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(pngs.length, 4);
  const dir = Buffer.alloc(16 * pngs.length);
  let offset = 6 + dir.length;
  pngs.forEach((p, i) => {
    const o = i * 16;
    dir.writeUInt8(p.size >= 256 ? 0 : p.size, o);
    dir.writeUInt8(p.size >= 256 ? 0 : p.size, o + 1);
    dir.writeUInt8(0, o + 2);
    dir.writeUInt8(0, o + 3);
    dir.writeUInt16LE(1, o + 4);
    dir.writeUInt16LE(32, o + 6);
    dir.writeUInt32LE(p.data.length, o + 8);
    dir.writeUInt32LE(offset, o + 12);
    offset += p.data.length;
  });
  return Buffer.concat([header, dir, ...pngs.map((p) => p.data)]);
}

function scene(opts: { sky: [string, string]; accent: string; motif: "city" | "road" | "build" | "campus" | "office" }) {
  const { sky, accent, motif } = opts;
  const skyline = Array.from({ length: 14 }, (_, i) => {
    const w = 70 + ((i * 37) % 60);
    const h = 180 + ((i * 83) % 260);
    const x = i * 120 - 20;
    return `<rect x="${x}" y="${900 - h}" width="${w}" height="${h}" rx="6" fill="#0c2550" opacity="${0.55 + (i % 3) * 0.12}"/>`;
  }).join("");
  // A stylised four-minaret silhouette nods to Hyderabad without cliché detail.
  const landmark = `<g transform="translate(720 470)" fill="#14366e"><rect x="0" y="160" width="200" height="270"/><rect x="-14" y="40" width="26" height="390"/><rect x="188" y="40" width="26" height="390"/><circle cx="-1" cy="36" r="16"/><circle cx="201" cy="36" r="16"/><path d="M40 160 q60-90 120 0z"/></g>`;
  const extras: Record<typeof motif, string> = {
    city: landmark,
    road: `<path d="M0 1050 L1600 980 L1600 1200 L0 1200z" fill="#20302e"/><path d="M0 1110 L1600 1060" stroke="#e0b46b" stroke-width="10" stroke-dasharray="70 50"/>
           <g transform="translate(560 900)"><rect x="0" y="40" width="300" height="120" rx="40" fill="${accent}"/><rect x="40" y="0" width="200" height="90" rx="30" fill="#f4d9a8"/><circle cx="60" cy="170" r="34" fill="#1b2321"/><circle cx="250" cy="170" r="34" fill="#1b2321"/></g>`,
    build: `<g stroke="#14366e" stroke-width="14" fill="none"><path d="M1100 920 V380 H1420"/><path d="M1100 420 L1380 380"/><path d="M1380 380 V560"/></g><rect x="1340" y="560" width="80" height="60" fill="${accent}"/>`,
    campus: `<g transform="translate(500 560)" fill="#14366e"><path d="M0 120 L300 0 L600 120z"/><rect x="40" y="120" width="520" height="220"/></g><g fill="${accent}"><rect x="600" y="700" width="40" height="120"/><rect x="700" y="700" width="40" height="120"/><rect x="800" y="700" width="40" height="120"/></g>`,
    office: `<g fill="#14366e"><rect x="560" y="300" width="220" height="600"/><rect x="820" y="420" width="200" height="480"/></g><g fill="#f4d9a8" opacity="0.8">${Array.from({ length: 24 }, (_, i) => `<rect x="${585 + (i % 4) * 48}" y="${330 + Math.floor(i / 4) * 90}" width="26" height="44"/>`).join("")}</g>`,
  };
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1600 1200">
    <defs><linearGradient id="s" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${sky[0]}"/><stop offset="1" stop-color="${sky[1]}"/></linearGradient></defs>
    <rect width="1600" height="1200" fill="url(#s)"/>
    <circle cx="1240" cy="330" r="150" fill="${accent}" opacity="0.9"/>
    <circle cx="1240" cy="330" r="230" fill="${accent}" opacity="0.18"/>
    ${skyline}
    ${extras[motif]}
    <rect y="900" width="1600" height="300" fill="#14366e" opacity="0.92"/>
    <path d="M0 960 C400 900 1100 1010 1600 940 L1600 1200 L0 1200z" fill="#0c2550"/>
  </svg>`;
}

async function main() {
  // Official logo (assets/logo-source.jpg): full wordmark for headers, circular emblem for icons.
  const src = path.join(root, "assets", "logo-source.jpg");
  const trimmed = await sharp(src).trim({ threshold: 30 }).toBuffer();
  const pad = { top: 12, bottom: 12, left: 12, right: 12, background: "#ffffff" };
  await sharp(trimmed).extend(pad).resize({ width: 1200 }).png({ palette: true, quality: 92, compressionLevel: 9 }).toFile(out("public", "images", "logo.png"));
  const emblem = await sharp(src).extract({ left: 68, top: 66, width: 420, height: 420 }).toBuffer();
  const icon = (size: number, padding = 0) =>
    sharp(emblem)
      .resize(size - padding * 2, size - padding * 2)
      .extend({ top: padding, bottom: padding, left: padding, right: padding, background: "#ffffff" })
      .flatten({ background: "#ffffff" })
      .png({ palette: true, quality: 90, compressionLevel: 9 });
  for (const f of ["icon.svg"]) fs.rmSync(out("src", "app", f), { force: true });
  await icon(192, 6).toFile(out("src", "app", "icon.png"));
  // ICO frames must be full RGBA PNGs (Next.js 16 / Turbopack rejects palette PNGs inside .ico).
  const frames = await Promise.all([16, 32, 48].map(async (size) => ({ size, data: await icon(size).ensureAlpha().png({ palette: false }).toBuffer() })));
  fs.writeFileSync(out("src", "app", "favicon.ico"), ico(frames));
  await icon(180, 14).toFile(out("src", "app", "apple-icon.png"));
  await icon(192, 6).toFile(out("public", "icons", "icon-192.png"));
  await icon(512, 16).toFile(out("public", "icons", "icon-512.png"));
  await icon(512, 72).toFile(out("public", "icons", "maskable-512.png")); // maskable safe zone

  const images: [string, Parameters<typeof scene>[0], number, number][] = [
    ["hero-city.jpg", { sky: ["#fdf2f4", "#e6ecf8"], accent: "#c8264f", motif: "city" }, 1600, 1200],
    ["programme-drive.jpg", { sky: ["#fdf2f4", "#f3d7de"], accent: "#c8264f", motif: "road" }, 1200, 675],
    ["programme-build.jpg", { sky: ["#eef2fa", "#d3def2"], accent: "#c8264f", motif: "build" }, 1200, 675],
    ["programme-nextgen.jpg", { sky: ["#eef0fb", "#d5daf3"], accent: "#c8264f", motif: "campus" }, 1200, 675],
    ["programme-workplace.jpg", { sky: ["#f5efe6", "#e4d6c3"], accent: "#c8264f", motif: "office" }, 1200, 675],
  ];
  for (const [name, opts, w, h] of images) {
    await sharp(Buffer.from(scene(opts))).resize(w, h, { fit: "cover" }).jpeg({ quality: 82, mozjpeg: true }).toFile(out("public", "images", name));
  }
  console.log("assets generated");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
