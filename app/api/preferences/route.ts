import { getChatGPTUser } from "@/app/chatgpt-auth";
import { db, originCheck, response, failure, HttpError, boundedBody } from "@/lib/server";
import { isLocale } from "@/lib/i18n/languages";
export const dynamic = "force-dynamic";
export async function GET() {
  try {
    const user = await getChatGPTUser();
    if (!user) throw new HttpError(401, "Sign in to save your language preference.");
    const row = await db().prepare("SELECT locale FROM language_preferences WHERE user_id=?").bind(user.userId).first<{locale:string}>();
    return response({ locale: row?.locale || "en" });
  } catch(e) { return failure(e); }
}
export async function PUT(req: Request) {
  try {
    originCheck(req);
    const user = await getChatGPTUser();
    if (!user) throw new HttpError(401, "Sign in to save your language preference.");
    let body;
    try { body = JSON.parse(new TextDecoder().decode(await boundedBody(req, 256))); }
    catch(e) { if (e instanceof SyntaxError) throw new HttpError(400, "Choose a supported language."); throw e; }
    if (!body || typeof body !== "object" || Array.isArray(body) || Object.keys(body).length !== 1 || !isLocale(body.locale)) throw new HttpError(400, "Choose a supported language.");
    await db().prepare("INSERT INTO language_preferences(user_id,locale) VALUES (?,?) ON CONFLICT(user_id) DO UPDATE SET locale=excluded.locale").bind(user.userId, body.locale).run();
    return response({ locale: body.locale });
  } catch(e) { return failure(e); }
}
