// Dev helper: prints a current TOTP code for a seeded test account (local development only).
import fs from "node:fs";
import { totp } from "@/lib/server/security/totp";
const file = process.argv[3] ?? ".dev-credentials.json";
const creds = JSON.parse(fs.readFileSync(file, "utf8")) as { users: { email: string; password: string; totpSecret: string }[] };
const u = creds.users.find((x) => x.email === process.argv[2]);
if (!u) throw new Error("unknown account");
console.log(JSON.stringify({ email: u.email, password: u.password, code: totp(u.totpSecret) }));
