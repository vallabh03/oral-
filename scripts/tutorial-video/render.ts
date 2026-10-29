// Renders the mouth-photo tutorial clips: one MP4 per step and language, plus one full video per
// language. Narration comes from Microsoft neural voices (edge-tts); only the public script text
// in src/lib/shared/tutorial.ts is sent, never patient data.
//
//   pip install edge-tts imageio-ffmpeg
//   FFMPEG=<path to ffmpeg> EDGE_TTS=<path to edge-tts> npx tsx scripts/tutorial-video/render.ts [--only=lips] [--lang=en]
//
// Output: public/tutorial/<lang>/<step>.mp4 (used by the site) and public/tutorial/<lang>/full.mp4.
import { execFileSync } from "node:child_process";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { chromium } from "playwright";
import { TUTORIAL_LANGS, TUTORIAL_STEPS, type TutorialLang } from "../../src/lib/shared/tutorial";
import { sceneHtml } from "./scene";

const FFMPEG = process.env.FFMPEG ?? "ffmpeg";
const EDGE_TTS = process.env.EDGE_TTS ?? "edge-tts";
const FPS = 24;
const LEAD_IN = 0.6; // seconds of animation before the narration starts
const TAIL = 0.9; // seconds after the narration ends
const END_CARD = 3; // extra seconds for the closing card on the last step
const OUT = resolve("public/tutorial");
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

async function main() {
  const work = join(tmpdir(), `taoc-tutorial-${process.pid}`);
  mkdirSync(work, { recursive: true });
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const langs = TUTORIAL_LANGS.filter((l) => !arg("lang") || l.code === arg("lang"));
  const steps = TUTORIAL_STEPS.filter((s) => !arg("only") || s.id === arg("only"));

  for (const lang of langs) {
    const dir = join(OUT, lang.code);
    mkdirSync(dir, { recursive: true });
    for (const step of steps) {
      const tag = `${lang.code}/${step.id}`;
      const voice = join(work, `${lang.code}-${step.id}.mp3`);
      execFileSync(EDGE_TTS, ["--voice", lang.voice, "--rate=-8%", "--text", step.say[lang.code as TutorialLang], "--write-media", voice], { stdio: "ignore" });
      const endCard = step.id === "doctor" ? END_CARD : 0;
      const duration = +(LEAD_IN + audioSeconds(voice) + TAIL + endCard).toFixed(2);

      await page.setContent(sceneHtml(step, lang.code as TutorialLang, duration, endCard), { waitUntil: "load" });
      await page.evaluate(() => document.fonts.ready);
      const frames = join(work, `${lang.code}-${step.id}`);
      rmSync(frames, { recursive: true, force: true });
      mkdirSync(frames);
      const total = Math.ceil(duration * FPS);
      for (let i = 0; i < total; i++) {
        await page.evaluate((ms) => document.getAnimations().forEach((a) => { a.pause(); a.currentTime = ms; }), (i / FPS) * 1000);
        await page.screenshot({ path: join(frames, `${String(i).padStart(5, "0")}.jpg`), type: "jpeg", quality: 90 });
      }

      execFileSync(FFMPEG, [
        "-y", "-hide_banner", "-loglevel", "error",
        "-framerate", String(FPS), "-i", join(frames, "%05d.jpg"),
        "-i", voice,
        "-filter_complex", `[1:a]adelay=${LEAD_IN * 1000}|${LEAD_IN * 1000},apad[a];[0:v]scale=960:540,format=yuv420p[v]`,
        "-map", "[v]", "-map", "[a]", "-t", String(duration),
        "-c:v", "libx264", "-preset", "slow", "-crf", "27", "-profile:v", "main",
        "-c:a", "aac", "-b:a", "64k", "-ac", "1", "-movflags", "+faststart",
        join(dir, `${step.id}.mp4`),
      ]);
      rmSync(frames, { recursive: true, force: true });
      console.log(`${tag}  ${duration}s`);
    }

    if (steps.length === TUTORIAL_STEPS.length) {
      const list = join(work, `${lang.code}-list.txt`);
      writeFileSync(list, TUTORIAL_STEPS.map((s) => `file '${join(dir, `${s.id}.mp4`).replace(/\\/g, "/")}'`).join("\n"));
      execFileSync(FFMPEG, ["-y", "-hide_banner", "-loglevel", "error", "-f", "concat", "-safe", "0", "-i", list, "-c", "copy", "-movflags", "+faststart", join(dir, "full.mp4")]);
      console.log(`${lang.code}/full  done`);
    }
  }
  await browser.close();
  rmSync(work, { recursive: true, force: true });
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
