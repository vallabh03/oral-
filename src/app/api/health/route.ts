import { handler } from "@/lib/server/http";
import { db } from "@/lib/server/db";

// Liveness/readiness for uptime monitoring. Reveals no versions or internals.
export const GET = handler({ auth: "public" }, async () => {
  const d = await db();
  await d.query("select 1");
  return { status: "ok" };
});
