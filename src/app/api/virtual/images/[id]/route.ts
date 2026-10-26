import { NextResponse } from "next/server";
import { handler, uuidParam } from "@/lib/server/http";
import { Errors } from "@/lib/server/errors";
import { staffImage } from "@/lib/server/services/virtual";

// Doctors see images directly (signed-in doctor session + role on every request; no public URL).
export const GET = handler({ auth: "staff", permission: "virtual.review" }, async ({ req, staff, params, correlationId }) => {
  const id = uuidParam.safeParse(params.id);
  if (!id.success) throw Errors.notFound();
  const variant = req.nextUrl.searchParams.get("v") === "full" ? "full" : "preview";
  const r = await staffImage(staff!, id.data, variant, correlationId);
  return new NextResponse(new Uint8Array(r.data), {
    headers: { "content-type": r.contentType, "content-length": String(r.data.length), "cache-control": "private, no-store, max-age=0", "x-content-type-options": "nosniff", "referrer-policy": "no-referrer" },
  });
});
