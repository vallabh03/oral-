import { NextResponse, type NextRequest } from "next/server";
import { handler, uuidParam } from "@/lib/server/http";
import { Errors } from "@/lib/server/errors";
import { can } from "@/lib/server/authz";
import { hashToken } from "@/lib/server/security/crypto";
import { staffCookieName } from "@/lib/server/security/session";
import { resolvePhoto, serveSignedThumb, verifyThumbSignature, type PhotoAccess } from "@/lib/server/services/photos";

/**
 * Serves participant photos.
 * - Signed thumbnails (from an authorised, audited record list): HMAC bound to the caller's
 *   session cookie, ≤20 min expiry, served with zero database queries — this is what lets
 *   record lists with photos scale.
 * - Everything else (full-size photos, participant's own photo): full session + scope check.
 * Photos are immutable (a retake gets a new id); responses carry strong ETags and must be
 * revalidated on every view (cheap 304s). With S3 the request redirects to a 5-minute presigned URL.
 */
// no-cache + ETag: every view is re-authorised (a cheap 304), so photos never outlive logout,
// session revocation or consent withdrawal in a shared device's cache.
const CACHE = { "cache-control": "private, no-cache", vary: "Cookie" };

function respond(r: PhotoAccess | "not-modified", ifNoneMatch: string | null): Response {
  if (r === "not-modified" || (r.kind === "bytes" && ifNoneMatch === r.etag)) return new NextResponse(null, { status: 304, headers: CACHE });
  if (r.kind === "redirect") return new NextResponse(null, { status: 302, headers: { location: r.url, "cache-control": "private, no-store" } });
  return new NextResponse(new Uint8Array(r.data), {
    status: 200,
    headers: { ...CACHE, "content-type": "image/webp", "content-length": String(r.data.length), etag: r.etag, "content-disposition": "inline", "x-content-type-options": "nosniff" },
  });
}

const authorised = handler({ auth: "staff-or-intake" }, async ({ req, staff, intake, params, correlationId }) => {
  const id = uuidParam.safeParse(params.id);
  if (!id.success) throw Errors.notFound();
  if (staff && !can(staff.role, "patient.photo.read")) throw Errors.forbidden();
  const variant = req.nextUrl.searchParams.get("v") === "full" ? "full" : "thumb";
  const r = await resolvePhoto(id.data, variant, { staff, intakePatientId: intake?.patientId ?? null }, req.headers.get("if-none-match"), correlationId);
  return respond(r, req.headers.get("if-none-match"));
});

export async function GET(req: NextRequest, ctx: { params: Promise<Record<string, string>> }) {
  const sp = req.nextUrl.searchParams;
  const { id } = await ctx.params;
  const p = sp.get("p");
  const sig = sp.get("s");
  const cookie = req.cookies.get(staffCookieName())?.value;
  if (sp.get("v") === "thumb" && p && sig && cookie && cookie.length <= 128 && uuidParam.safeParse(id).success && uuidParam.safeParse(p).success) {
    if (verifyThumbSignature(id!, p, Number(sp.get("e")), sig, hashToken(cookie))) {
      const r = await serveSignedThumb(id!, p);
      if (r) return respond(r, req.headers.get("if-none-match"));
    }
  }
  return authorised(req, ctx);
}
