// Renders the mouth-photo tutorial videos for every language:
//   public/tutorial/<lang>/guide.mp4   the mandatory guide, fitted to GUIDE_SECONDS (45 s)
//   public/tutorial/<lang>/<view>.mp4  an optional short clip per required photo
// Narration comes from Microsoft neural voices (edge-tts); only the public script text in
// src/lib/shared/tutorial.ts is sent, never patient data.
//
//   pip install edge-tts imageio-ffmpeg
//   FFMPEG=<path to ffmpeg> EDGE_TTS=<path to edge-tts> npx tsx scripts/tutorial-video/render.ts [--lang=en] [--only=guide|clips]
import { execFileSync } from "node:child_process";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { chromium, type Page } from "playwright";
import { GUIDE_SCENES, GUIDE_SECONDS, TUTORIAL_LANGS, VIEW_CLIPS, type TutorialLang, type TutorialScene } from "../../src/lib/shared/tutorial";
import { sceneHtml } from "./scene";

const FFMPEG = process.env.FFMPEG ?? "ffmpeg";
const EDGE_TTS = process.env.EDGE_TTS ?? "edge-tts";
const FPS = 24;
const OUT = resolve("public/tutorial");
const work = join(tmpdir(), `taoc-tutorial-${process.pid}`);
const arg = (k: string) => process.argv.find((a) => a.startsWith(`--${k}=`))?.split("=")[1];

function audioSeconds(file: string): number {
  let out = "";
  try {
    execFileSync(FFMPEG, ["-hide_banner", "-i", file], { stdio: ["ignore", "ignore", "pipe"] });
  } catch (e) {
    out = String((e as { stderr: Buffer }).stderr);
  }
  const m = /Duration: (\d+):(\d+):([\d.]+)/.exec(out);
  if (!m) throw new Error(`Could not read the length of ${file}`);
  return +m[1]! * 3600 + +m[2]! * 60 + +m[3]!;
}

function speak(voice: string, text: string, rate: number, file: string): number {
  execFileSync(EDGE_TTS, ["--voice", voice, `--rate=${rate >= 0 ? "+" : ""}${rate}%`, "--text", text, "--write-media", file], { stdio: "ignore" });
  return audioSeconds(file);
}

/** Renders one scene to an MP4 with its narration starting at `leadIn` seconds. */
async function renderScene(page: Page, scene: TutorialScene, lang: TutorialLang, voiceFile: string, duration: number, leadIn: number, out: string) {
  await page.setContent(sceneHtml(scene, lang, duration), { waitUntil: "load" });
  await page.evaluate(() => document.fonts.ready);
  const frames = join(work, `frames-${lang}-${scene.id}`);
  rmSync(frames, { recursive: true, force: true });
  mkdirSync(frames, { recursive: true });
  const total = Math.round(duration * FPS);
  for (let i = 0; i < total; i++) {
    await page.evaluate((ms) => document.getAnimations().forEach((a) => { a.pause(); a.currentTime = ms; }), (i / FPS) * 1000);
    await page.screenshot({ path: join(frames, `${String(i).padStart(5, "0")}.jpg`), type: "jpeg", quality: 90 });
  }
  const ms = Math.round(leadIn * 1000);
  execFileSync(FFMPEG, [
    "-y", "-hide_banner", "-loglevel", "error",
    "-framerate", String(FPS), "-i", join(frames, "%05d.jpg"),
    "-i", voiceFile,
    "-filter_complex", `[1:a]adelay=${ms}|${ms},apad,aresample=24000[a];[0:v]scale=960:540,format=yuv420p[v]`,
    "-map", "[v]", "-map", "[a]", "-t", (total / FPS).toFixed(3),
    "-c:v", "libx264", "-preset", "slow", "-crf", "27", "-profile:v", "main", "-color_range", "tv",
    "-c:a", "aac", "-b:a", "64k", "-ac", "1", "-movflags", "+faststart", out,
  ]);
  rmSync(frames, { recursive: true, force: true });
}

async function renderClips(page: Page, lang: (typeof TUTORIAL_LANGS)[number]) {
  for (const clip of VIEW_CLIPS) {
    const voice = join(work, `${lang.code}-clip-${clip.id}.mp3`);
    const len = speak(lang.voice, clip.say[lang.code], -8, voice);
    const duration = +(0.6 + len + 0.9).toFixed(2);
    await renderScene(page, clip, lang.code, voice, duration, 0.6, join(OUT, lang.code, `${clip.view}.mp4`));
    console.log(`${lang.code}/${clip.view}  ${duration}s`);
  }
}

/** The guide must last GUIDE_SECONDS: speed the voice up slightly if needed, then share the spare time between scenes. */
async function renderGuide(page: Page, lang: (typeof TUTORIAL_LANGS)[number]) {
  const minPad = 0.6; // seconds of animation around each scene's narration
  let rate = -8;
  let lens: number[] = [];
  for (;;) {
    lens = GUIDE_SCENES.map((s) => speak(lang.voice, s.say[lang.code], rate, join(work, `${lang.code}-guide-${s.id}.mp3`)));
    const spoken = lens.reduce((a, b) => a + b, 0);
    if (spoken + minPad * GUIDE_SCENES.length <= GUIDE_SECONDS || rate >= 25) break;
    rate += 4;
  }
  const spare = GUIDE_SECONDS - lens.reduce((a, b) => a + b, 0);
  const pad = spare / GUIDE_SCENES.length;
  // Whole frames per scene, with the rounding left on the last scene, so the guide is exactly GUIDE_SECONDS long.
  const frames = lens.map((l) => Math.round((l + pad) * FPS));
  frames[frames.length - 1]! += GUIDE_SECONDS * FPS - frames.reduce((a, b) => a + b, 0);
  const parts: string[] = [];
  for (const [i, scene] of GUIDE_SCENES.entries()) {
    const part = join(work, `${lang.code}-guide-${i}.mp4`);
    await renderScene(page, scene, lang.code, join(work, `${lang.code}-guide-${scene.id}.mp3`), frames[i]! / FPS, Math.min(0.5, pad / 2), part);
    parts.push(part);
  }
  const list = join(work, `${lang.code}-guide.txt`);
  writeFileSync(list, parts.map((p) => `file '${p.replace(/\\/g, "/")}'`).join("\n"));
  execFileSync(FFMPEG, ["-y", "-hide_banner", "-loglevel", "error", "-f", "concat", "-safe", "0", "-i", list, "-c", "copy", "-movflags", "+faststart", join(OUT, lang.code, "guide.mp4")]);
  console.log(`${lang.code}/guide  ${GUIDE_SECONDS}s (voice rate ${rate}%)`);
}

async function main() {
  mkdirSync(work, { recursive: true });
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  for (const lang of TUTORIAL_LANGS.filter((l) => !arg("lang") || l.code === arg("lang"))) {
    mkdirSync(join(OUT, lang.code), { recursive: true });
    if (arg("only") !== "clips") await renderGuide(page, lang);
    if (arg("only") !== "guide") await renderClips(page, lang);
  }
  await browser.close();
  rmSync(work, { recursive: true, force: true });
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
