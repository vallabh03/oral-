import { getChatGPTUser } from "@/app/chatgpt-auth";
import { db, originCheck, response, failure, HttpError, boundedBody, rateKey, hash } from "@/lib/server";
import { isLocale } from "@/lib/i18n/languages";
export const dynamic = "force-dynamic";
export async function GET(req: Request) {
  try {
    const user = await getChatGPTUser();
    if (!user) throw new HttpError(401, "Sign in to save your language preference.");
    // Light per-user rate limit (60/min) — prevents scraping preference endpoint.
    const bucket = Math.floor(Date.now() / 60000);
    await rateKey(`pref-get:${await hash(user.userId)}:${bucket}`, 60, 60, "Too many requests.");
    const row = await db().prepare("SELECT locale FROM language_preferences WHERE user_id=?").bind(user.userId).first<{locale:string}>();
    return response({ locale: row?.locale || "en" });
  } catch(e) { return failure(e); }
}
export async function PUT(req: Request) {
  try {
    originCheck(req);
    const user = await getChatGPTUser();
    if (!user) throw new HttpError(401, "Sign in to save your language preference.");
    // Stricter rate limit (10/min): locale changes are rare; this prevents automated D1 writes.
    const bucket = Math.floor(Date.now() / 60000);
    await rateKey(`pref-put:${await hash(user.userId)}:${bucket}`, 10, 60, "Language preference changes are rate-limited. Please wait a moment.");
    let body;
    try { body = JSON.parse(new TextDecoder().decode(await boundedBody(req, 256))); }
    catch(e) { if (e instanceof SyntaxError) throw new HttpError(400, "Choose a supported language."); throw e; }
    if (!body || typeof body !== "object" || Array.isArray(body) || Object.keys(body).length !== 1 || !isLocale(body.locale)) throw new HttpError(400, "Choose a supported language.");
    await db().prepare("INSERT INTO language_preferences(user_id,locale) VALUES (?,?) ON CONFLICT(user_id) DO UPDATE SET locale=excluded.locale").bind(user.userId, body.locale).run();
    return response({ locale: body.locale });
  } catch(e) { return failure(e); }
}
