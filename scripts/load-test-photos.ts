/**
 * Load test for participant photo capture and photo-backed record retrieval (PRD §2.2, §11).
 *
 *   npm run load:photos            # defaults: 5,000 records, 50 concurrent sessions
 *   LOAD_RECORDS=5000 LOAD_CONCURRENCY=50 LOAD_UPLOADS=600 LOAD_SECONDS=30 npm run load:photos
 *
 * 1. Prepares an isolated synthetic dataset (.data/load) with N participants, each with a photo.
 * 2. Starts the production build on port 3200 (APP_ENV=test, local object storage).
 * 3. Phase A — upload burst: C concurrent camp devices upload photos (mix of client-compressed
 *    WebP and large uncompressed JPEG fallbacks), with client retry on 503 backpressure.
 * 4. Phase B — retrieval: C concurrent staff sessions page through records and load every
 *    thumbnail; second pass revalidates with ETags (304).
 * 5. Phase C — mixed: uploads and retrieval at the same time.
 * Writes load-results/report.json and load-results/report.md.
 */
import { spawn, type ChildProcess } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { Agent, fetch as ufetch } from "undici";

const RECORDS = Number(process.env.LOAD_RECORDS ?? 5000);
const C = Number(process.env.LOAD_CONCURRENCY ?? 50);
const UPLOADS = Number(process.env.LOAD_UPLOADS ?? 600);
const SECONDS = Number(process.env.LOAD_SECONDS ?? 30);
const PORT = 3200;
const BASE = `http://localhost:${PORT}`;
const DATA = ".data/load";
const OBJECTS = ".data/load-objects";
const OUT = "load-results";

const env: NodeJS.ProcessEnv = {
  ...process.env, APP_ENV: "test", NODE_ENV: "production", PGLITE_DIR: DATA, STORAGE_DRIVER: "local", LOCAL_STORAGE_DIR: OBJECTS,
  DISABLE_RATE_LIMITS: "1", INTAKE_ENABLED: "true", NEXT_TELEMETRY_DISABLED: "1",
};

// ---------- stats ----------
type Sample = { ms: number; status: number; bytes: number };
function summarize(samples: Sample[], wallMs: number) {
  const ok = samples.filter((s) => s.status >= 200 && s.status < 400);
  const lat = ok.map((s) => s.ms).sort((a, b) => a - b);
  const q = (p: number) => (lat.length ? Math.round(lat[Math.min(lat.length - 1, Math.floor((p / 100) * lat.length))]!) : 0);
  const byStatus: Record<string, number> = {};
  for (const s of samples) byStatus[s.status] = (byStatus[s.status] ?? 0) + 1;
  return {
    requests: samples.length, ok: ok.length, errorRate: samples.length ? +((1 - ok.length / samples.length) * 100).toFixed(2) : 0,
    rps: +(samples.length / (wallMs / 1000)).toFixed(1), p50: q(50), p95: q(95), p99: q(99), max: lat.at(-1) ?? 0,
    mbTransferred: +(samples.reduce((a, s) => a + s.bytes, 0) / 1e6).toFixed(1), byStatus,
  };
}
async function pool<T>(n: number, items: T[], fn: (t: T, worker: number) => Promise<void>) {
  let i = 0;
  await Promise.all(Array.from({ length: n }, async (_, w) => {
    while (i < items.length) await fn(items[i++]!, w);
  }));
}

// ---------- phase 0: dataset ----------
async function prepare() {
  fs.rmSync(DATA, { recursive: true, force: true });
  for (const f of [`${DATA}.snapshot.tgz`, `${DATA}.lock`]) fs.rmSync(f, { force: true });
  fs.rmSync(OBJECTS, { recursive: true, force: true });
  Object.assign(process.env, env);
  const { db, closeDbForTests } = await import("@/lib/server/db");
  const { processPhoto } = await import("@/lib/server/images");
  const { createStaffSession } = await import("@/lib/server/security/session");
  const { syntheticPortrait } = await import("./seed-lib");
  const d = await db();
  const t0 = Date.now();
  const variants = await Promise.all([1, 2, 3, 4, 5, 6, 7, 8].map(async (i) => processPhoto(await syntheticPortrait(i))));
  const camp = (await d.query<{ id: string }>("insert into camps (code, name, working_area, status, is_public) values ('LOAD-01','Load camp','Load area','active',true) returning id")).rows[0]!.id;
  const hash = crypto.createHash("sha256").update("policy").digest("hex");
  const ids: string[] = [];
  const BATCH = 250;
  for (let b = 0; b < RECORDS; b += BATCH) {
    await d.tx(async (q) => {
      for (let i = b; i < Math.min(RECORDS, b + BATCH); i++) {
        const id = crypto.randomUUID();
        ids.push(id);
        await q.query(
          `insert into patients (id, display_id, full_name, age, mobile, driver_type, camp_id, recruitment_source, created_via, status, created_at)
           values ($1,$2,$3,$4,$5,'auto',$6,'stand','self','questionnaire_completed', now() - make_interval(secs => $7))`,
          [id, `HAOC-DS-${String(i + 1).padStart(5, "0")}`, `Synthetic Person ${i + 1}`, 20 + (i % 50), `9${String(700000000 + i)}`, camp, RECORDS - i],
        );
        const consent = (await q.query<{ id: string }>(
          "insert into consents (patient_id, consent_type, status, policy_version, policy_text_sha256, language, actor_type) values ($1,'photo','granted','v1',$2,'en','participant') returning id",
          [id, hash])).rows[0]!.id;
        await q.query("insert into consents (patient_id, consent_type, status, policy_version, policy_text_sha256, language, actor_type) values ($1,'screening','granted','v1',$2,'en','participant')", [id, hash]);
        const v = variants[i % variants.length]!;
        const pid = crypto.randomUUID();
        const key = `photos/${id}/${pid}.webp`;
        const thumb = `photos/${id}/${pid}-thumb.webp`;
        fs.mkdirSync(path.join(OBJECTS, "photos", id), { recursive: true });
        fs.writeFileSync(path.join(OBJECTS, key), v.full);
        fs.writeFileSync(path.join(OBJECTS, thumb), v.thumb);
        await q.query(
          `insert into patient_photos (id, patient_id, consent_id, storage_driver, object_key, thumb_key, mime, bytes, thumb_bytes, width, height, sha256, captured_by_type, idempotency_key)
           values ($1,$2,$3,'local',$4,$5,'image/webp',$6,$7,$8,$9,$10,'participant',$11)`,
          [pid, id, consent, key, thumb, v.full.length, v.thumb.length, v.width, v.height, v.sha256, `load-${pid}`],
        );
      }
    });
  }
  // One staff Admin per simulated device; sessions are created directly (MFA already "passed").
  const sessions: { token: string; csrf: string }[] = [];
  for (let i = 0; i < C; i++) {
    const u = (await d.query<{ id: string }>("insert into users (email, display_name, role, mfa_enabled) values ($1, $2, 'admin', true) returning id", [`load${i}@example.test`, `Load Admin ${i}`])).rows[0]!.id;
    const s = await createStaffSession(u, { mfaVerified: true, authMethod: "password" });
    sessions.push({ token: s.token, csrf: s.csrfToken });
  }
  await closeDbForTests();
  return { ids, sessions, prepareMs: Date.now() - t0 };
}

// ---------- server ----------
async function startServer(): Promise<ChildProcess> {
  const child = spawn(process.execPath, ["node_modules/next/dist/bin/next", "start", "-p", String(PORT)], { env, stdio: ["ignore", "pipe", "pipe"] });
  child.stderr!.on("data", (b) => process.env.LOAD_DEBUG && process.stderr.write(b));
  for (let i = 0; i < 120; i++) {
    try {
      if ((await fetch(`${BASE}/api/health`)).ok) return child;
    } catch {}
    await new Promise((r) => setTimeout(r, 500));
  }
  child.kill();
  throw new Error("server did not start");
}

// ---------- workloads ----------
// Each simulated browser/device keeps a small pool of persistent connections (browsers use ~6
// per origin), instead of opening a new socket per request.
const agents = new Map<string, Agent>();
type Sess = { token: string; csrf: string };
function sfetch(s: Sess, url: string, init: Parameters<typeof ufetch>[1] = {}) {
  let a = agents.get(s.token);
  if (!a) agents.set(s.token, (a = new Agent({ connections: 6, keepAliveTimeout: 30_000 })));
  return ufetch(url, { ...init, dispatcher: a }) as unknown as Promise<Response>;
}
const headers = (s: { token: string; csrf: string }, extra: Record<string, string> = {}) => ({ cookie: `ds_session=${s.token}`, "x-csrf-token": s.csrf, origin: BASE, ...extra });

const clientErrors: Record<string, number> = {};
async function timed(fn: () => Promise<Response>): Promise<Sample & { res?: Response }> {
  const t = performance.now();
  try {
    const res = await fn();
    const buf = await res.arrayBuffer();
    return { ms: performance.now() - t, status: res.status, bytes: buf.byteLength };
  } catch (e) {
    const code = String((e as { cause?: { code?: string } }).cause?.code ?? (e as Error).message).slice(0, 60);
    clientErrors[code] = (clientErrors[code] ?? 0) + 1;
    return { ms: performance.now() - t, status: 0, bytes: 0 };
  }
}

async function uploadWorkload(ids: string[], sessions: { token: string; csrf: string }[], count: number) {
  // Photo-like texture: blurred noise compresses like a real face photo (not a flat colour).
  const texture = (w: number, h: number) => sharp({ create: { width: w, height: h, channels: 3, background: "#808080", noise: { type: "gaussian", mean: 128, sigma: 60 } } }).blur(2.2);
  const small = await texture(720, 960).webp({ quality: 82 }).toBuffer(); // what CameraCapture uploads
  const large = await texture(1600, 2133).jpeg({ quality: 88 }).toBuffer(); // older device / JPEG fallback
  const samples: Sample[] = [];
  let retries = 0;
  const jobs = Array.from({ length: count }, (_, i) => ({ id: ids[i % ids.length]!, big: i % 10 < 3 }));
  const t0 = performance.now();
  await pool(sessions.length, jobs, async (job, w) => {
    const key = crypto.randomUUID().replace(/-/g, "") + "L";
    for (let attempt = 0; attempt < 5; attempt++) {
      const body = job.big ? large : small;
      const s = await timed(() => sfetch(sessions[w]!, `${BASE}/api/patients/${job.id}/photo`, { method: "POST", body: Buffer.from(body), headers: headers(sessions[w]!, { "content-type": job.big ? "image/jpeg" : "image/webp", "idempotency-key": key }) }));
      s.bytes = body.length;
      if (s.status === 503 && attempt < 4) {
        retries++;
        await new Promise((r) => setTimeout(r, 300 * 2 ** attempt + Math.random() * 200));
        continue;
      }
      samples.push(s);
      break;
    }
  });
  return { ...summarize(samples, performance.now() - t0), clientRetriesOn503: retries, payloadMix: { smallWebpKB: Math.round(small.length / 1024), largeJpegKB: Math.round(large.length / 1024), largeShare: "30%" } };
}

async function retrievalWorkload(sessions: { token: string; csrf: string }[], seconds: number) {
  const lists: Sample[] = [];
  const thumbs: Sample[] = [];
  const revalidated: Sample[] = [];
  const deadline = Date.now() + seconds * 1000;
  const t0 = performance.now();
  await Promise.all(sessions.map(async (s) => {
    const etags = new Map<string, string>();
    let cursor: string | null = null;
    while (Date.now() < deadline) {
      let page: { items: { photo: { thumbUrl: string } | null }[]; nextCursor: string | null } | null = null;
      const l = await timed(async () => {
        const res = await sfetch(s, `${BASE}/api/patients?limit=24${cursor ? `&cursor=${cursor}` : ""}`, { headers: headers(s) });
        page = res.ok ? await res.clone().json() : null;
        return res;
      });
      lists.push(l);
      if (!page) continue;
      const p = page as { items: { photo: { thumbUrl: string } | null }[]; nextCursor: string | null };
      cursor = p.nextCursor && Math.random() < 0.85 ? p.nextCursor : null;
      // Browsers fetch ~6 images in parallel per origin over HTTP/1.1.
      await pool(6, p.items.filter((i) => i.photo).map((i) => i.photo!.thumbUrl), async (url) => {
        const known = etags.get(url);
        const t = performance.now();
        const res = await sfetch(s, BASE + url, { headers: headers(s, known ? { "if-none-match": known } : {}) }).catch((e) => {
          const code = String(e?.cause?.code ?? e?.message).slice(0, 60);
          clientErrors[code] = (clientErrors[code] ?? 0) + 1;
          return null;
        });
        const buf = res ? await res.arrayBuffer() : new ArrayBuffer(0);
        const sample = { ms: performance.now() - t, status: res?.status ?? 0, bytes: buf.byteLength };
        if (res?.headers.get("etag")) etags.set(url, res.headers.get("etag")!);
        (known ? revalidated : thumbs).push(sample);
      });
    }
  }));
  const wall = performance.now() - t0;
  return { listPages: summarize(lists, wall), thumbnails: summarize(thumbs, wall), revalidations304: summarize(revalidated, wall) };
}

// ---------- main ----------
fs.mkdirSync(OUT, { recursive: true });
console.log(`Preparing ${RECORDS} synthetic participants with photos…`);
const prep = await prepare();
console.log(`Dataset ready in ${(prep.prepareMs / 1000).toFixed(1)}s. Starting server…`);
const server = await startServer();
try {
  console.log(`Phase A: ${UPLOADS} uploads from ${C} concurrent devices…`);
  const uploads = await uploadWorkload(prep.ids, prep.sessions, UPLOADS);
  console.log(uploads);
  console.log(`Phase B: retrieval with photos, ${C} sessions for ${SECONDS}s…`);
  const retrieval = await retrievalWorkload(prep.sessions, SECONDS);
  console.log(retrieval);
  console.log("Phase C: mixed uploads + retrieval…");
  const half = Math.ceil(C / 2);
  const [mixedUploads, mixedRetrieval] = await Promise.all([
    uploadWorkload(prep.ids.slice(1000), prep.sessions.slice(0, half), Math.round(UPLOADS / 2)),
    retrievalWorkload(prep.sessions.slice(half), Math.max(10, Math.round(SECONDS / 2))),
  ]);
  const report = {
    when: new Date().toISOString(),
    environment: { records: RECORDS, concurrency: C, node: process.version, cpus: (await import("node:os")).availableParallelism(), database: "PGlite (embedded, single-threaded) — production uses RDS PostgreSQL", storage: "local disk — production uses S3 + presigned redirects" },
    targets: { listP95ms: 2000, errorRate: "< 1% (excluding 503s that the client retried)" },
    phaseA_uploads: uploads,
    phaseB_retrieval: retrieval,
    phaseC_mixed: { uploads: mixedUploads, retrieval: mixedRetrieval },
    clientErrors,
  };
  fs.writeFileSync(path.join(OUT, "report.json"), JSON.stringify(report, null, 2));
  const row = (name: string, s: ReturnType<typeof summarize>) => `| ${name} | ${s.requests} | ${s.errorRate}% | ${s.rps} | ${s.p50} | ${s.p95} | ${s.p99} | ${s.mbTransferred} |`;
  fs.writeFileSync(path.join(OUT, "report.md"), [
    `# Photo load test — ${report.when}`, "",
    `Dataset: ${RECORDS} participants with photos · ${C} concurrent sessions · ${report.environment.cpus} CPUs · ${report.environment.database}`, "",
    "| Workload | Requests | Errors | Req/s | p50 ms | p95 ms | p99 ms | MB |", "|---|---|---|---|---|---|---|---|",
    row("A. Photo uploads (burst)", uploads),
    row("B. Record list pages", retrieval.listPages),
    row("B. Thumbnails (first load)", retrieval.thumbnails),
    row("B. Thumbnails (ETag revalidation)", retrieval.revalidations304),
    row("C. Uploads under mixed load", mixedUploads),
    row("C. List pages under mixed load", mixedRetrieval.listPages),
    row("C. Thumbnails under mixed load", mixedRetrieval.thumbnails), "",
    `Client retries after 503 backpressure: A=${uploads.clientRetriesOn503}, C=${mixedUploads.clientRetriesOn503}. Payloads: ${uploads.payloadMix.smallWebpKB} KB WebP (70%), ${uploads.payloadMix.largeJpegKB} KB JPEG (30%).`,
    `Client-side connection errors: ${JSON.stringify(clientErrors)}`,
  ].join("\n") + "\n");
  console.log(`\nReport → ${OUT}/report.md`);
} finally {
  server.kill();
}
