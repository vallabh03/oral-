import "server-only";
import fs from "node:fs";
import path from "node:path";
import { config } from "../config";

export type Row = Record<string, unknown>;
export interface Queryable {
  query<T = Row>(sql: string, params?: unknown[]): Promise<{ rows: T[] }>;
}
export interface Db extends Queryable {
  tx<T>(fn: (q: Queryable) => Promise<T>): Promise<T>;
  close(): Promise<void>;
  kind: "pglite" | "pg";
}

// All SQL in this codebase is parameterised ($1, $2 …). Never interpolate user input.

/**
 * Embedded PGlite for development/tests. A directory-backed PGlite gets corrupted when the
 * process is force-killed mid-write (a recurring problem on Windows dev machines), so local data
 * instead lives in memory and is persisted as an atomic snapshot (write temp file → rename):
 * a hard kill can lose at most the last ~second of changes but can never corrupt the database.
 * A pid lock prevents two processes (e.g. the seed script and the server) using it at once.
 */
async function createPglite(dir: string): Promise<Db> {
  const { PGlite } = await import("@electric-sql/pglite");
  if (dir === "memory://") return wrapPglite(new PGlite(), async () => {});

  const snapshot = `${dir.replace(/[\\/]+$/, "")}.snapshot.tgz`;
  const lockFile = `${dir.replace(/[\\/]+$/, "")}.lock`;
  fs.mkdirSync(path.dirname(path.resolve(snapshot)), { recursive: true });
  acquireLock(lockFile);

  let pg: InstanceType<typeof PGlite>;
  if (fs.existsSync(snapshot)) {
    pg = new PGlite({ loadDataDir: new Blob([new Uint8Array(fs.readFileSync(snapshot))]) });
  } else if (fs.existsSync(path.join(dir, "PG_VERSION"))) {
    // One-time migration from the old directory format (if it is still readable).
    try {
      const old = new PGlite(dir);
      await old.waitReady;
      const blob = await old.dumpDataDir("gzip");
      await old.close();
      pg = new PGlite({ loadDataDir: blob });
    } catch {
      console.warn(`[db] The old local database in ${dir} could not be opened (corrupted). Starting a fresh local database; run "npm run seed:dev" to add synthetic data.`);
      pg = new PGlite();
    }
  } else {
    pg = new PGlite();
  }
  await pg.waitReady;

  let dirty = false;
  let timer: NodeJS.Timeout | undefined;
  let saving: Promise<void> | undefined;
  const save = async () => {
    if (!dirty) return;
    dirty = false;
    const blob = await pg.dumpDataDir("gzip");
    const tmp = `${snapshot}.${process.pid}.tmp`;
    fs.writeFileSync(tmp, new Uint8Array(await blob.arrayBuffer()));
    // Atomic replace. OneDrive/antivirus can briefly lock the file on Windows, so retry a few times.
    for (let i = 0; ; i++) {
      try {
        fs.renameSync(tmp, snapshot);
        break;
      } catch (e) {
        if (i >= 5 || (e as NodeJS.ErrnoException).code !== "EPERM") throw e;
        await new Promise((r) => setTimeout(r, 100 * (i + 1)));
      }
    }
  };
  const flush = async () => {
    if (timer) clearTimeout(timer);
    timer = undefined;
    await saving;
    saving = save().catch((e) => {
      dirty = true;
      console.error("[db] local snapshot save failed:", (e as Error).message);
    });
    await saving;
  };
  const markDirty = () => {
    dirty = true;
    timer ??= setTimeout(() => void flush(), 1000);
  };
  return wrapPglite(pg, async () => {
    await flush();
    releaseLock(lockFile);
  }, markDirty);
}

function wrapPglite(pg: import("@electric-sql/pglite").PGlite, onClose: () => Promise<void>, markDirty: () => void = () => {}): Db {
  const isRead = (sql: string) => /^\s*(select|show|explain)\b/i.test(sql);
  return {
    kind: "pglite",
    async query<T>(sql: string, params: unknown[] = []) {
      const r = await pg.query<T>(sql, params);
      if (!isRead(sql)) markDirty();
      return { rows: r.rows };
    },
    async tx(fn) {
      const result = await pg.transaction(async (t) =>
        fn({
          async query<T>(sql: string, params: unknown[] = []) {
            const r = await t.query<T>(sql, params);
            return { rows: r.rows };
          },
        }),
      );
      markDirty();
      return result;
    },
    async close() {
      await onClose();
      await pg.close();
    },
  };
}

// The owner touches the lock file every few seconds. A lock that has not been touched recently is
// stale even if its pid exists: after a crash or reboot Windows readily reuses process ids.
const LOCK_HEARTBEAT_MS = 5_000;
const LOCK_STALE_MS = 15_000;
const heartbeats = new Map<string, NodeJS.Timeout>();

function acquireLock(lockFile: string) {
  if (fs.existsSync(lockFile)) {
    const pid = Number(fs.readFileSync(lockFile, "utf8"));
    const fresh = Date.now() - fs.statSync(lockFile).mtimeMs < LOCK_STALE_MS;
    let alive = false;
    try {
      alive = fresh && !!pid && pid !== process.pid && process.kill(pid, 0);
    } catch {
      alive = false;
    }
    if (alive) throw new Error(`The local database is in use by another process (pid ${pid}). Stop the running server before seeding or starting another one.`);
  }
  fs.writeFileSync(lockFile, String(process.pid));
  const beat = setInterval(() => {
    try {
      const now = new Date();
      fs.utimesSync(lockFile, now, now);
    } catch {}
  }, LOCK_HEARTBEAT_MS);
  beat.unref();
  heartbeats.set(lockFile, beat);
  process.once("exit", () => releaseLock(lockFile));
}

function releaseLock(lockFile: string) {
  clearInterval(heartbeats.get(lockFile));
  heartbeats.delete(lockFile);
  try {
    if (fs.readFileSync(lockFile, "utf8") === String(process.pid)) fs.rmSync(lockFile, { force: true });
  } catch {}
}

async function createPg(url: string, max: number): Promise<Db> {
  const { Pool, types } = await import("pg");
  types.setTypeParser(20, (v) => Number(v)); // bigint counts → number
  const pool = new Pool({
    connectionString: url,
    max,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 5_000,
    statement_timeout: 15_000,
    ssl: url.includes("sslmode=disable") ? undefined : { rejectUnauthorized: true },
  });
  pool.on("error", (err) => {
    console.error("[db:pool] unexpected idle client error", (err as Error).message);
  });
  return {
    kind: "pg",
    async query<T>(sql: string, params: unknown[] = []) {
      const r = await pool.query(sql, params);
      return { rows: r.rows as T[] };
    },
    async tx(fn) {
      const client = await pool.connect();
      try {
        await client.query("begin");
        const result = await fn({
          async query<T>(sql: string, params: unknown[] = []) {
            const r = await client.query(sql, params);
            return { rows: r.rows as T[] };
          },
        });
        await client.query("commit");
        return result;
      } catch (e) {
        await client.query("rollback").catch(() => {});
        throw e;
      } finally {
        client.release();
      }
    },
    close: () => pool.end(),
  };
}

const g = globalThis as unknown as { __dbPromise?: Promise<Db> };

export function db(): Promise<Db> {
  if (!g.__dbPromise) {
    // Never touch the database while `next build` prerenders: build workers are killed
    // abruptly, which would corrupt an embedded PGlite directory. Pages handle the error.
    if (process.env.NEXT_PHASE === "phase-production-build") return Promise.reject(new Error("database unavailable during build"));
    g.__dbPromise = (async () => {
      const c = config();
      const instance = c.DATABASE_URL ? await createPg(c.DATABASE_URL, c.DB_POOL_MAX) : await createPglite(c.PGLITE_DIR);
      // Embedded PGlite (dev/test) migrates itself; RDS is migrated by the deployment pipeline.
      if (instance.kind === "pglite") {
        await migrate(instance);
        // On shutdown signals, flush the latest changes to the local snapshot before exiting.
        for (const sig of ["SIGINT", "SIGTERM", "SIGBREAK"] as const) {
          process.once(sig, () => void instance.close().finally(() => process.exit(0)));
        }
      }
      return instance;
    })();
    g.__dbPromise.catch(() => (g.__dbPromise = undefined));
  }
  return g.__dbPromise;
}

export async function closeDbForTests() {
  if (g.__dbPromise) {
    const d = await g.__dbPromise;
    g.__dbPromise = undefined;
    await d.close();
  }
}

export function migrationsDir() {
  return path.join(process.cwd(), "src", "lib", "server", "db", "migrations");
}

export async function migrate(d: Db): Promise<string[]> {
  await d.query("create table if not exists schema_migrations (version text primary key, applied_at timestamptz not null default now())");
  const done = new Set((await d.query<{ version: string }>("select version from schema_migrations")).rows.map((r) => r.version));
  const files = fs.readdirSync(migrationsDir()).filter((f) => f.endsWith(".sql")).sort();
  const applied: string[] = [];
  for (const f of files) {
    const version = f.replace(/\.sql$/, "");
    if (done.has(version)) continue;
    const sql = fs.readFileSync(path.join(migrationsDir(), f), "utf8");
    await d.tx(async (t) => {
      await execScript(d, t, sql);
      await t.query("insert into schema_migrations (version) values ($1)", [version]);
    });
    applied.push(version);
  }
  return applied;
}

async function execScript(d: Db, t: Queryable, sql: string) {
  if (d.kind === "pg") {
    await t.query(sql);
    return;
  }
  // PGlite's extended protocol takes one statement per query, so split on statement
  // boundaries while respecting $$-quoted function bodies.
  for (const stmt of splitSql(sql)) await t.query(stmt);
}

export function splitSql(sql: string): string[] {
  const out: string[] = [];
  let buf = "";
  let inDollar = false;
  const lines = sql.split(/\r?\n/);
  for (const raw of lines) {
    const line = raw.replace(/--.*$/, inDollar ? "$&" : "");
    buf += line + "\n";
    const dollarCount = (line.match(/\$\$/g) || []).length;
    if (dollarCount % 2 === 1) inDollar = !inDollar;
    if (!inDollar && line.trimEnd().endsWith(";")) {
      if (buf.trim()) out.push(buf.trim());
      buf = "";
    }
  }
  if (buf.trim()) out.push(buf.trim());
  return out;
}
