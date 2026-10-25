import { NextResponse } from "next/server";
import { handler, uuidParam } from "@/lib/server/http";
import { Errors } from "@/lib/server/errors";
import { staffCookieName } from "@/lib/server/security/session";
import { serveLesionContent } from "@/lib/server/services/lesionImages";

// Serves bytes for a short-lived, session-bound link. The service re-checks the signature,
// expiry, live session, role, patient scope and consent on every request.
export const GET = handler({ auth: "public" }, async ({ req, params, correlationId }) => {
  const id = uuidParam.safeParse(params.imageId);
  if (!id.success) throw Errors.notFound();
  const sp = req.nextUrl.searchParams;
  const r = await serveLesionContent({ imageId: id.data, variant: sp.get("v"), exp: sp.get("e"), sig: sp.get("s"), cookie: req.cookies.get(staffCookieName())?.value }, correlationId);
  return new NextResponse(new Uint8Array(r.data), {
    status: 200,
    headers: {
      "content-type": r.contentType,
      "content-length": String(r.data.length),
      "content-disposition": r.disposition,
      "cache-control": "private, no-store, max-age=0",
      "x-content-type-options": "nosniff",
      "referrer-policy": "no-referrer",
    },
  });
});
