// Prepares an isolated, synthetic database for end-to-end tests (run before `next start`).
import fs from "node:fs";
import { closeDbForTests } from "@/lib/server/db";
import { seedDev } from "./seed-dev";

const dir = process.env.PGLITE_DIR ?? ".data/e2e";
if (!dir.includes("e2e")) throw new Error("Refusing to reset a non-e2e database directory");
fs.rmSync(dir, { recursive: true, force: true });
for (const f of [`${dir}.snapshot.tgz`, `${dir}.lock`]) fs.rmSync(f, { force: true });
await seedDev(".e2e-credentials.json");
await closeDbForTests();
console.log("e2e database ready");
