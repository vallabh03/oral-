// Provisions a staff account and prints a single-use setup link (valid 24 hours).
// Usage: npm run staff:create -- <email> <super_admin|admin|assistant> <Display Name...>
import { db, closeDbForTests } from "@/lib/server/db";
import { createResetToken, SETUP_LINK_MINUTES } from "@/lib/server/services/auth";
import { config } from "@/lib/server/config";

const [emailArg, role, ...nameParts] = process.argv.slice(2);
const email = emailArg?.toLowerCase();
const name = nameParts.join(" ").trim();
if (!email || !/^\S+@\S+\.\S+$/.test(email) || !["super_admin", "admin", "assistant"].includes(role ?? "") || !name) {
  console.error("Usage: npm run staff:create -- <email> <super_admin|admin|assistant> <Display Name>");
  process.exit(1);
}
const d = await db();
const r = await d.query<{ id: string }>(
  `insert into users (email, display_name, role) values ($1, $2, $3)
   on conflict (email) do update set role = excluded.role, display_name = excluded.display_name, status = 'active'
   returning id`,
  [email, name, role],
);
const token = await createResetToken(r.rows[0]!.id, SETUP_LINK_MINUTES);
console.log(`${role}\t${email}\t${config().NEXT_PUBLIC_SITE_URL}/workspace/reset#token=${token}`);
await closeDbForTests();
