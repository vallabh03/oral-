import fs from "node:fs";
import crypto from "node:crypto";
import sharp from "sharp";
import { db } from "@/lib/server/db";
import { hashPassword } from "@/lib/server/security/password";
import { encryptSecret } from "@/lib/server/security/crypto";
import { generateTotpSecret } from "@/lib/server/security/totp";
import type { Role } from "@/lib/shared/constants";

// Synthetic data only — never real participant information (PRD §12, Definition of Done).

export type SeedUser = { email: string; password: string; totpSecret: string; role: Role; id: string };

export async function seedUser(email: string, name: string, role: Role, campScope: string[] | null = null): Promise<SeedUser> {
  const d = await db();
  const password = crypto.randomBytes(12).toString("base64url") + "-Aa1";
  const totpSecret = generateTotpSecret();
  const r = await d.query<{ id: string }>(
    `insert into users (email, display_name, role, password_hash, mfa_secret_enc, mfa_enabled, camp_scope, password_changed_at)
     values ($1, $2, $3, $4, $5, true, $6, now())
     on conflict (email) do update set password_hash = excluded.password_hash, mfa_secret_enc = excluded.mfa_secret_enc, mfa_enabled = true,
       mfa_last_step = null, status = 'active', role = excluded.role, camp_scope = excluded.camp_scope, failed_logins = 0, locked_until = null
     returning id`,
    [email, name, role, await hashPassword(password), encryptSecret(totpSecret), campScope],
  );
  return { email, password, totpSecret, role, id: r.rows[0]!.id };
}

export async function seedCamp(code: string, name: string, area: string, isPublic = true): Promise<string> {
  const d = await db();
  const r = await d.query<{ id: string }>(
    `insert into camps (code, name, working_area, starts_at, ends_at, status, is_public)
     values ($1, $2, $3, now() + interval '2 days', now() + interval '2 days 6 hours', 'planned', $4)
     on conflict (code) do update set name = excluded.name returning id`,
    [code, name, area, isPublic],
  );
  return r.rows[0]!.id;
}

/** A synthetic "face" image (coloured shapes) so photo flows can be exercised without real photos. */
export async function syntheticPortrait(seed: number, size = 640): Promise<Buffer> {
  const hue = (seed * 47) % 360;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${Math.round(size * 1.25)}" viewBox="0 0 400 500">
    <rect width="400" height="500" fill="hsl(${hue},45%,82%)"/><ellipse cx="200" cy="210" rx="110" ry="140" fill="hsl(${(hue + 30) % 360},35%,62%)"/>
    <circle cx="160" cy="190" r="14" fill="#222"/><circle cx="240" cy="190" r="14" fill="#222"/><path d="M150 280 q50 40 100 0" stroke="#222" stroke-width="8" fill="none"/>
    <rect x="80" y="380" width="240" height="140" rx="60" fill="hsl(${(hue + 180) % 360},40%,40%)"/><text x="20" y="40" font-size="28" font-family="sans-serif">${seed}</text></svg>`;
  return sharp(Buffer.from(svg)).jpeg({ quality: 85 }).toBuffer();
}

export function writeCredentials(file: string, data: unknown) {
  fs.writeFileSync(file, JSON.stringify(data, null, 2), { mode: 0o600 });
}
