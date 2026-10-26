import { handler } from "@/lib/server/http";
import { virtualQueueSchema } from "@/lib/server/schemas";
import { reviewQueue } from "@/lib/server/services/virtual";

// Doctor review queue. Every doctor sees every virtual case (they are not tied to a camp).
export const GET = handler({ auth: "staff", permission: "virtual.review" }, async ({ req, staff }) => {
  const { status } = virtualQueueSchema.parse(Object.fromEntries(req.nextUrl.searchParams));
  return reviewQueue(staff!, status);
});
