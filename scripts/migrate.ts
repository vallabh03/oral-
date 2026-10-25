// Applies pending SQL migrations (used by the deployment pipeline against RDS).
// In AWS this runs as the init container of every new task, with the migration (owner) role.
// When APP_DB_USER/APP_DB_PASSWORD are set it also provisions the app's DML-only login role.
import { db, migrate, type Queryable } from "@/lib/server/db";

// Arbitrary constant: serialises migrations when several tasks start at once.
const MIGRATION_LOCK = 704_311_2026;

const d = await db();
if (d.kind === "pg") {
  // Transaction-level advisory lock held on one pooled connection for the whole run;
  // migrations themselves run on other connections and other tasks wait here.
  await d.tx(async (lock) => {
    await lock.query("select pg_advisory_xact_lock($1)", [MIGRATION_LOCK]);
    await run();
    await provisionAppRole(lock);
  });
} else {
  await run();
}
await d.close();

async function run() {
  const applied = await migrate(d);
  console.log(applied.length ? `Applied: ${applied.join(", ")}` : "Schema is up to date.");
}

async function provisionAppRole(q: Queryable) {
  const user = process.env.APP_DB_USER;
  const password = process.env.APP_DB_PASSWORD;
  if (!user || !password) return;
  if (!/^[a-z_][a-z0-9_]{2,62}$/.test(user)) throw new Error("APP_DB_USER must be a lowercase identifier");
  // DDL cannot take bind parameters: let Postgres quote the identifier and literal itself.
  const exists = (await q.query<{ n: number }>("select count(*)::int as n from pg_roles where rolname = $1", [user])).rows[0]!.n > 0;
  const stmt = (await q.query<{ s: string }>(`select format('${exists ? "alter" : "create"} role %I login password %L', $1::text, $2::text) as s`, [user, password])).rows[0]!.s;
  await q.query(stmt);
  // Data access only: no DDL, no ownership. Append-only/immutability triggers still apply.
  const grants = [
    "grant usage on schema public to %I",
    "grant select, insert, update, delete on all tables in schema public to %I",
    "grant usage, select on all sequences in schema public to %I",
    "alter default privileges in schema public grant select, insert, update, delete on tables to %I",
    "alter default privileges in schema public grant usage, select on sequences to %I",
  ];
  for (const g of grants) {
    const s = (await q.query<{ s: string }>(`select format('${g}', $1::text) as s`, [user])).rows[0]!.s;
    await q.query(s);
  }
  console.log(`App role ${user} is ${exists ? "up to date" : "created"} (DML only).`);
}
