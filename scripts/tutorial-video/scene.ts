// Builds one animated tutorial scene as a self-contained HTML page (1280×720). Every animation is
// a CSS animation timed against --d (the clip length in seconds), so render.ts can step through
// them frame by frame. Drawings are simple flat illustrations: no real patient images are used.
import { TUTORIAL_UI, type PhotoView, type TutorialLang, type TutorialScene } from "../../src/lib/shared/tutorial";

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** Close-up of the mouth for each photo view, drawn in a 300×220 box. */
function mouth(view: string): string {
  const lips = `<ellipse cx="150" cy="110" rx="130" ry="92" fill="#c8606a"/>`;
  const inside = (ry = 66) => `<ellipse cx="150" cy="112" rx="106" ry="${ry}" fill="#4a1622"/>`;
  const upperTeeth = `<g fill="#fffaf2">${[78, 104, 130, 156, 182, 208].map((x) => `<rect x="${x - 2}" y="50" width="22" height="24" rx="6"/>`).join("")}</g>`;
  const lowerTeeth = `<g fill="#fffaf2">${[92, 116, 140, 164, 188].map((x) => `<rect x="${x}" y="152" width="20" height="18" rx="5"/>`).join("")}</g>`;
  const tongue = `<path d="M84 150 Q150 112 216 150 Q206 176 150 178 Q94 176 84 150 Z" fill="#e8848c"/><path d="M150 140 V170" stroke="#c9606c" stroke-width="3" stroke-linecap="round"/>`;
  const hl = (d: string) => `<path class="hl" d="${d}"/>`;
  const finger = (side: 1 | -1) =>
    `<g transform="translate(${side === 1 ? 262 : 38} 118) rotate(${side === 1 ? -12 : 12})"><rect x="-22" y="-70" width="44" height="120" rx="22" fill="#e7ad86"/><rect x="-14" y="-62" width="28" height="22" rx="9" fill="#f6d0b6"/></g>`;
  switch (view) {
    case "lips":
      return `${lips}${inside()}${upperTeeth}${tongue}${lowerTeeth}${hl("M40 110 Q150 -10 260 110 Q150 230 40 110 Z")}`;
    case "cheek_left": // participant's left = viewer's right
      return `${lips}${inside(70)}<path d="M206 66 Q258 110 206 162 Q226 112 206 66 Z" fill="#d98088"/>${tongue}${hl("M200 58 Q272 110 200 168")}${finger(1)}`;
    case "cheek_right":
      return `${lips}${inside(70)}<path d="M94 66 Q42 110 94 162 Q74 112 94 66 Z" fill="#d98088"/>${tongue}${hl("M100 58 Q28 110 100 168")}${finger(-1)}`;
    case "upper_mouth": // camera pointing up: roof of the mouth (palate) inside the upper teeth
      return `${lips}${inside(74)}<path d="M62 118 Q150 22 238 118 Q150 150 62 118 Z" fill="#d97884"/><path d="M150 62 V128 M118 84 q32 10 64 0 M108 104 q42 12 84 0" stroke="#b9566a" stroke-width="3" fill="none" stroke-linecap="round"/><g fill="#fffaf2">${[70, 92, 116, 140, 164, 188, 210].map((x, i) => `<rect x="${x}" y="${116 - Math.abs(3 - i) * 12}" width="20" height="20" rx="5"/>`).join("")}</g><path d="M142 150 q8 -6 16 0 v10 q-8 8 -16 0 z" fill="#e8848c"/>${hl("M56 120 Q150 10 244 120 Q150 156 56 120 Z")}`;
    case "lower_mouth": // camera pointing down: under the tongue, floor of the mouth, lower gums
      return `${lips}${inside(70)}<path d="M84 70 Q150 30 216 70 Q206 100 150 104 Q94 100 84 70 Z" fill="#e8848c"/><path d="M86 118 Q150 106 214 118 Q204 168 150 174 Q96 168 86 118 Z" fill="#d97884"/><path d="M150 106 V160" stroke="#b44a5a" stroke-width="4" stroke-linecap="round"/><path d="M118 124 Q126 146 120 162 M182 124 Q174 146 180 162" stroke="#7b6fb5" stroke-width="3" fill="none" stroke-linecap="round"/>${lowerTeeth}${hl("M80 112 Q150 96 220 112 Q210 182 150 186 Q90 182 80 112 Z")}`;
    default: // relaxed open mouth
      return `${lips}${inside()}${upperTeeth}${tongue}${lowerTeeth}`;
  }
}

/** A friendly face whose mouth is the close-up drawing for the view. */
function face(view: string, x: number, y: number, s = 1): string {
  return `<g transform="translate(${x} ${y}) scale(${s})">
    <path d="M-230 330 Q-230 200 -60 180 h120 Q230 200 230 330 Z" fill="#1b5e8a"/>
    <rect x="-50" y="120" width="100" height="90" fill="#dba27d"/>
    <ellipse cx="-150" cy="-10" rx="22" ry="36" fill="#dba27d"/><ellipse cx="150" cy="-10" rx="22" ry="36" fill="#dba27d"/>
    <path d="M-148 -50 Q-148 -205 0 -205 Q148 -205 148 -50 Q148 120 70 170 Q0 200 -70 170 Q-148 120 -148 -50 Z" fill="#e9b48f"/>
    <path d="M-158 -60 Q-160 -230 0 -226 Q160 -230 158 -60 Q120 -150 0 -160 Q-120 -150 -158 -60 Z" fill="#2b2230"/>
    <ellipse cx="-60" cy="-40" rx="13" ry="16" fill="#2b2230"/><ellipse cx="60" cy="-40" rx="13" ry="16" fill="#2b2230"/>
    <path d="M-86 -78 q26 -14 52 0 M34 -78 q26 -14 52 0" stroke="#2b2230" stroke-width="7" fill="none" stroke-linecap="round"/>
    <path d="M0 -20 q-10 40 6 46" stroke="#c98d6c" stroke-width="6" fill="none" stroke-linecap="round"/>
    <g transform="translate(-75 54) scale(0.5)">${mouth(view)}</g>
  </g>`;
}

/** A phone held up, with a camera viewfinder showing the close-up. */
function phone(view: string): string {
  return `<g class="phone-in">
    <rect x="740" y="-6" width="330" height="440" rx="42" fill="#15202b"/>
    <rect x="754" y="8" width="302" height="412" rx="32" fill="#0d1620"/>
    <g transform="translate(755 92)">${mouth(view)}</g>
    <g class="frame" stroke-width="7" fill="none" stroke-linecap="round">
      <path d="M780 70 v-26 h40 M1030 70 v-26 h-40 M780 330 v26 h40 M1030 330 v26 h-40"/>
    </g>
    <circle class="shutter" cx="905" cy="392" r="22" fill="#fff" stroke="#9fb3c8" stroke-width="5"/>
    <g class="tick"><circle cx="1040" cy="30" r="30" fill="#1f9d55"/><path d="M1025 30 l10 10 l20 -22" stroke="#fff" stroke-width="7" fill="none" stroke-linecap="round" stroke-linejoin="round"/></g>
  </g>
  <path class="hand" d="M1050 300 q70 30 60 140 h-160 q-10 -60 20 -90 q30 -40 80 -50 z" fill="#e7ad86"/>`;
}

function arrow(dir: "left" | "right" | "up" | "down"): string {
  // Left/right point at the participant's own side: their left appears on the viewer's right.
  // Up/down show which way the camera points for the upper and lower mouth.
  const at = { left: [560, 280], right: [70, 280], up: [560, 230], down: [560, 250] }[dir];
  const d = {
    left: "M0 0 h-80 m0 0 l30 -30 m-30 30 l30 30", right: "M0 0 h80 m0 0 l-30 -30 m30 30 l-30 30",
    up: "M0 40 v-80 m0 0 l-30 30 m30 -30 l30 30", down: "M0 -40 v80 m0 0 l-30 -30 m30 30 l30 -30",
  }[dir];
  return `<g transform="translate(${at[0]} ${at[1]})"><g class="bob"><path d="${d}" stroke="#f2b705" stroke-width="16" fill="none" stroke-linecap="round" stroke-linejoin="round"/></g></g>`;
}

const ARROWS: Partial<Record<PhotoView, "left" | "right" | "up" | "down">> = { cheek_left: "left", cheek_right: "right", upper_mouth: "up", lower_mouth: "down" };

function photoScene(view: PhotoView): string {
  const dir = ARROWS[view];
  return `${face(view, 320, 220, 0.92)}${dir ? arrow(dir) : ""}${phone(view)}`;
}

function introScene(lang: TutorialLang): string {
  const chips = [TUTORIAL_UI.photos[lang], TUTORIAL_UI.upload_label[lang], TUTORIAL_UI.review_label[lang]];
  const icons = [
    `<rect x="-26" y="-18" width="52" height="38" rx="8" fill="none" stroke="#fff" stroke-width="5"/><circle cx="0" cy="1" r="10" fill="none" stroke="#fff" stroke-width="5"/>`,
    `<path d="M0 22 V-18 M-16 -2 L0 -18 L16 -2" stroke="#fff" stroke-width="6" fill="none" stroke-linecap="round" stroke-linejoin="round"/>`,
    `<path d="M-14 -20 v18 a14 14 0 0 0 28 0 v-18 M0 12 v8 a10 10 0 0 0 20 0 v-4" stroke="#fff" stroke-width="5" fill="none" stroke-linecap="round"/><circle cx="20" cy="14" r="5" fill="#fff"/>`,
  ];
  return `<text x="640" y="96" text-anchor="middle" class="brand-big">Telangana Against Oral Cancer</text>
  ${chips.map((c, i) => `<g transform="translate(${260 + i * 380} 270)"><g class="pop p${i}">
    <rect x="-150" y="-78" width="300" height="156" rx="26" fill="${["#1b5e8a", "#2a7f62", "#b0213a"][i]}"/>
    <g transform="translate(0 -26)">${icons[i]}</g>
    <text y="46" text-anchor="middle" class="chip">${esc(c)}</text></g></g>
    ${i < 2 ? `<path class="pop p${i}b" d="M${420 + i * 380} 270 h40 m-14 -14 l14 14 l-14 14" stroke="#1b5e8a" stroke-width="7" fill="none" stroke-linecap="round"/>` : ""}`).join("")}`;
}

function reviewScene(lang: TutorialLang): string {
  const names = TUTORIAL_UI.thumbs[lang].split("|");
  const views = ["lips", "cheek_left", "cheek_right", "upper_mouth", "lower_mouth"];
  return `${views.map((v, i) => `<g transform="translate(${140 + i * 250} 40)"><g class="pop p${i}">
      <rect x="-105" y="0" width="210" height="190" rx="18" fill="#fff" stroke="#d6e4ef" stroke-width="3"/>
      <g transform="translate(-75 12) scale(0.5)">${mouth(v)}</g>
      <text y="166" text-anchor="middle" class="thumb-t">${esc(names[i] ?? "")}</text>
      <g class="tk t${i}"><circle cx="88" cy="10" r="22" fill="#1f9d55"/><path d="M78 10 l7 7 l13 -15" stroke="#fff" stroke-width="5" fill="none" stroke-linecap="round"/></g></g></g>`).join("")}
    <g class="press"><rect x="470" y="250" width="340" height="74" rx="37" fill="#1b5e8a"/><text x="640" y="298" text-anchor="middle" class="btn-t">${esc(TUTORIAL_UI.upload[lang])}</text></g>
    <rect x="390" y="340" width="500" height="16" rx="8" fill="#d6e4ef"/><rect class="bar" x="390" y="340" width="500" height="16" rx="8" fill="#1f9d55"/>
    <g transform="translate(250 386)"><rect x="-14" y="-4" width="28" height="22" rx="4" fill="#1b5e8a"/><path d="M-8 -4 v-8 a8 8 0 0 1 16 0 v8" stroke="#1b5e8a" stroke-width="4" fill="none"/></g>
    <text x="280" y="400" class="note">${esc(TUTORIAL_UI.privacy[lang])}</text>
    <g transform="translate(250 422)"><circle r="14" fill="#b0213a"/><text y="8" text-anchor="middle" class="help-q">?</text></g>
    <text x="280" y="432" class="note">${esc(TUTORIAL_UI.help[lang])}</text>`;
}

export function sceneHtml(scene: TutorialScene, lang: TutorialLang, durationSec: number, endCardSec = 0): string {
  const body = scene.scene === "intro" ? introScene(lang) : scene.scene === "review" ? reviewScene(lang) : photoScene(scene.view!);
  const isPhoto = scene.scene === "photo";
  const endStart = Math.max(0, (durationSec - endCardSec) / durationSec);
  return `<!doctype html><html lang="${lang}"><head><meta charset="utf-8"><style>
  :root { --d: ${durationSec}s; }
  * { box-sizing: border-box; }
  html, body { margin: 0; width: 1280px; height: 720px; overflow: hidden; background: linear-gradient(160deg, #f4f9fd, #e3eff8); font-family: "Segoe UI", "Nirmala UI", sans-serif; }
  .top { position: absolute; left: 40px; top: 26px; right: 40px; display: flex; align-items: center; justify-content: space-between; }
  .logo { font-weight: 800; letter-spacing: .06em; color: #14466a; font-size: 22px; }
  .logo span { color: #b0213a; font-weight: 600; letter-spacing: 0; margin-left: 8px; }
  .title { background: #14466a; color: #fff; font-size: 34px; font-weight: 700; padding: 8px 26px; border-radius: 40px; animation: drop .6s both; }
  svg.stage { position: absolute; left: 0; top: 108px; width: 1280px; height: 440px; overflow: visible; }
  .subs { position: absolute; left: 0; right: 0; bottom: 0; min-height: 160px; background: rgba(8, 20, 32, .9); color: #fff; font-size: ${lang === "en" ? 34 : 31}px; line-height: 1.4; padding: 18px 60px; display: flex; align-items: center; justify-content: center; text-align: center; font-weight: 600; }
  .brand-big { font-size: 62px; font-weight: 900; fill: #14466a; letter-spacing: 0; }
  .brand-sub { font-size: 32px; fill: #b0213a; font-weight: 700; }
  .chip { font-size: ${lang === "en" ? 34 : 28}px; font-weight: 700; fill: #fff; }
  .card-t { font-size: 30px; font-weight: 700; fill: #14466a; }
  .thumb-t { font-size: 24px; font-weight: 700; fill: #14466a; }
  .btn-t { font-size: 32px; font-weight: 700; fill: #fff; }
  .note { font-size: 25px; font-weight: 600; fill: #14466a; }
  .help-q { font-size: 22px; font-weight: 800; fill: #fff; }
  .end-big { font-size: 96px; font-weight: 900; fill: #fff; letter-spacing: .06em; }
  .end-sub { font-size: 40px; font-weight: 700; fill: #f6c3cc; }
  .end-tag { font-size: 40px; font-weight: 600; fill: #fff; font-style: italic; }
  .hl { fill: none; stroke: #f2b705; stroke-width: 7; stroke-dasharray: 18 12; animation: dash 1.2s linear infinite, fadein .4s calc(var(--d) * .2) both; }
  .phone-in { animation: slide .8s .2s both cubic-bezier(.2,.8,.2,1); }
  .hand { animation: slide .8s .2s both cubic-bezier(.2,.8,.2,1); }
  .frame { stroke: #fff; animation: green .3s calc(var(--d) * .45) both; }
  .shutter { transform-box: fill-box; transform-origin: center; animation: press .35s calc(var(--d) * .58) both; }
  .tick { transform-box: fill-box; transform-origin: center; animation: pop .4s calc(var(--d) * .62) both; }
  .flash { position: absolute; inset: 0; background: #fff; opacity: 0; ${isPhoto ? "animation: flash .5s calc(var(--d) * .58) both;" : ""} }
  .bob { animation: bob .9s ease-in-out infinite alternate, fadein .4s .4s both; }
  .pop { transform-box: fill-box; transform-origin: center; animation: pop .5s both; }
  .p0 { animation-delay: .3s; } .p1 { animation-delay: calc(var(--d) * .18); } .p2 { animation-delay: calc(var(--d) * .34); }
  .p3 { animation-delay: calc(var(--d) * .44); } .p4 { animation-delay: calc(var(--d) * .52); }
  .p0b { animation-delay: calc(var(--d) * .12); } .p1b { animation-delay: calc(var(--d) * .28); }
  .tk { transform-box: fill-box; transform-origin: center; animation: pop .35s both; }
  .t0 { animation-delay: calc(var(--d) * .2); } .t1 { animation-delay: calc(var(--d) * .26); } .t2 { animation-delay: calc(var(--d) * .32); } .t3 { animation-delay: calc(var(--d) * .38); } .t4 { animation-delay: calc(var(--d) * .44); }
  .press { transform-box: fill-box; transform-origin: center; animation: press .4s calc(var(--d) * .55) both; }
  .bar { transform-box: fill-box; transform-origin: left; animation: grow calc(var(--d) * .3) calc(var(--d) * .6) both linear; }
  .drip { animation: drip 1s linear infinite; }
  .spin { animation: spin 6s linear infinite; }
  .open { transform-box: fill-box; transform-origin: center; animation: openm 1.4s ease-in-out infinite alternate; }
  .ring { transform-box: fill-box; transform-origin: top center; animation: pop .4s calc(var(--d) * ${(endStart * 0.7).toFixed(3)}) both, ring .3s calc(var(--d) * ${(endStart * 0.7).toFixed(3)}) 4 alternate; }
  .endcard { opacity: 0; ${endCardSec ? `animation: fadein .7s calc(var(--d) * ${endStart.toFixed(3)}) both;` : ""} }
  .hide-subs { ${endCardSec ? `animation: fadeout .5s calc(var(--d) * ${endStart.toFixed(3)}) both;` : ""} }
  @keyframes drop { from { transform: translateY(-30px); opacity: 0; } }
  @keyframes slide { from { transform: translateX(420px); opacity: 0; } }
  @keyframes green { to { stroke: #22c55e; } }
  @keyframes press { 50% { transform: scale(.82); } }
  @keyframes pop { from { transform: scale(0); opacity: 0; } 70% { transform: scale(1.12); } }
  @keyframes flash { 0% { opacity: 0; } 25% { opacity: .92; } 100% { opacity: 0; } }
  @keyframes bob { to { transform: ${scene.view === "upper_mouth" ? "translateY(-22px)" : scene.view === "lower_mouth" ? "translateY(22px)" : scene.view === "cheek_left" ? "translateX(-22px)" : "translateX(22px)"}; } }
  @keyframes fadein { from { opacity: 0; } to { opacity: 1; } }
  @keyframes fadeout { to { opacity: 0; } }
  @keyframes dash { to { stroke-dashoffset: -60; } }
  @keyframes grow { from { transform: scaleX(0); } to { transform: scaleX(1); } }
  @keyframes drip { from { transform: translateY(0); opacity: 1; } to { transform: translateY(40px); opacity: 0; } }
  @keyframes spin { to { transform: rotate(360deg); } }
  @keyframes openm { from { transform: scale(.9, .7); } to { transform: scale(1); } }
  @keyframes ring { from { transform: rotate(-14deg); } to { transform: rotate(14deg); } }
  </style></head><body>
  <div class="top hide-subs"><div class="logo">${scene.scene === "intro" ? "" : "Telangana Against Oral Cancer"}</div>${scene.scene === "intro" ? "" : `<div class="title">${esc(scene.title[lang])}</div>`}</div>
  <svg class="stage" viewBox="0 0 1280 440">${body}</svg>
  <div class="subs hide-subs">${esc(scene.say[lang])}</div>
  <div class="flash"></div>
  </body></html>`;
}
