/**
 * Lightweight secret scanner for the working tree and git history (checklist §6, §16).
 * Complements (does not replace) a dedicated scanner such as gitleaks in CI.
 */
import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const PATTERNS: [string, RegExp][] = [
  ["AWS access key", /\b(AKIA|ASIA)[0-9A-Z]{16}\b/],
  ["AWS secret key", /aws_secret_access_key\s*[:=]\s*['"]?[A-Za-z0-9/+]{40}/i],
  ["Private key", /-----BEGIN (RSA |EC |OPENSSH |)PRIVATE KEY-----/],
  ["Generic secret assignment", /\b(secret|token|password|api[_-]?key)\b\s*[:=]\s*['"][A-Za-z0-9_\-+/=]{24,}['"]/i],
  // A ${VAR} placeholder (filled from a private env file at runtime) is not a password.
  ["Postgres URL with password", /postgres(ql)?:\/\/[^:\s]+:(?!\$\{)[^@\s]{6,}@/i],
  ["Google API key", /\bAIza[0-9A-Za-z_-]{35}\b/],
  ["Slack token", /\bxox[abprs]-[0-9A-Za-z-]{10,}/],
];
const SKIP_DIRS = new Set(["node_modules", ".next", ".git", ".data", "test-results", "playwright-report", "load-results", "coverage", "cdk.out", "dist"]);
const ALLOW = [/dev-only-insecure-secret/, /test-(audit|data)-.*key/, /example\.(org|test)/];

const findings: string[] = [];
function scanText(label: string, text: string) {
  text.split(/\r?\n/).forEach((line, i) => {
    if (ALLOW.some((a) => a.test(line))) return;
    for (const [name, re] of PATTERNS) if (re.test(line)) findings.push(`${label}:${i + 1} — ${name}`);
  });
}
function walk(dir: string) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (SKIP_DIRS.has(e.name)) continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p);
    else if (/\.(ts|tsx|js|mjs|cjs|json|ya?ml|md|sql|env|txt|sh)$/.test(e.name) || e.name.startsWith(".env")) {
      if (/\.(dev|e2e)-credentials\.json$/.test(e.name)) continue; // git-ignored synthetic test accounts
      scanText(path.relative(process.cwd(), p), fs.readFileSync(p, "utf8"));
    }
  }
}

walk(process.cwd());
const tracked = (() => { try { return execSync("git ls-files", { encoding: "utf8" }).split("\n"); } catch { return []; } })();
for (const f of tracked) if (/(^|\/)\.env(\..*)?$/.test(f) && !f.endsWith(".env.example")) findings.push(`${f} — .env file is tracked by git`);
try {
  const history = execSync("git log -p --all --no-color", { encoding: "utf8", maxBuffer: 256 * 1024 * 1024 });
  scanText("git-history", history);
} catch {}

if (findings.length) {
  console.error(`Potential secrets found (${findings.length}):\n` + findings.map((f) => "  " + f).join("\n"));
  process.exit(1);
}
console.log("Secret scan: no findings in working tree or git history.");
