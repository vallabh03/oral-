import { NextResponse } from "next/server";
import { handler, uuidParam } from "@/lib/server/http";
import { Errors } from "@/lib/server/errors";
import { patientImage, removeImage } from "@/lib/server/services/virtual";

// The participant's own photo preview (never cached), and removal before submission.
export const GET = handler({ auth: "intake" }, async ({ intake, params }) => {
  const id = uuidParam.safeParse(params.imageId);
  if (!id.success) throw Errors.notFound();
  const data = await patientImage(intake!.patientId, id.data);
  return new NextResponse(new Uint8Array(data), {
    headers: { "content-type": "image/webp", "content-length": String(data.length), "cache-control": "private, no-store, max-age=0", "x-content-type-options": "nosniff" },
  });
});

export const DELETE = handler({ auth: "intake" }, async ({ intake, params, correlationId }) => {
  const id = uuidParam.safeParse(params.imageId);
  if (!id.success) throw Errors.notFound();
  return removeImage(intake!.patientId, id.data, correlationId);
});
