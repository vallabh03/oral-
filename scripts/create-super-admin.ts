// Bootstraps the first Super Admin (production: run once via the controlled pipeline).
// Prints a single-use setup link; the user then sets a password and enrols MFA.
import { db, closeDbForTests } from "@/lib/server/db";
import { createResetToken, SETUP_LINK_MINUTES } from "@/lib/server/services/auth";
import { config } from "@/lib/server/config";

const email = process.argv[2]?.toLowerCase();
const name = process.argv.slice(3).join(" ") || "Super Admin";
if (!email || !/^\S+@\S+\.\S+$/.test(email)) {
  console.error("Usage: npm run admin:create -- <email> [display name]");
  process.exit(1);
}
const d = await db();
const r = await d.query<{ id: string }>(
  "insert into users (email, display_name, role) values ($1, $2, 'super_admin') on conflict (email) do update set role = 'super_admin', status = 'active' returning id",
  [email, name],
);
const token = await createResetToken(r.rows[0]!.id, SETUP_LINK_MINUTES);
console.log(`Super Admin ready: ${email}\nOne-time setup link (expires in 24 hours): ${config().NEXT_PUBLIC_SITE_URL}/workspace/reset#token=${token}`);
await closeDbForTests();
