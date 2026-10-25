import { NextResponse } from "next/server";
import { handler } from "@/lib/server/http";
import { eventSchema } from "@/lib/server/schemas";
import { LIMITS } from "@/lib/server/security/rateLimit";
import { recordEvent } from "@/lib/server/services/public";

// First-party, consent-gated conversion events (the client only sends after analytics consent).
export const POST = handler({ auth: "public", body: eventSchema, maxBodyBytes: 2048, rateLimit: [{ limit: LIMITS.events, by: "ip" }] }, async ({ body }) => {
  await recordEvent(body);
  return new NextResponse(null, { status: 204 });
});
