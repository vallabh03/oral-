import { handler } from "@/lib/server/http";
import { db, getDbStats } from "@/lib/server/db";

// Liveness/readiness for uptime monitoring. Reveals no versions or internals for public probes.
export const GET = handler({ auth: "public" }, async ({ staff }) => {
  const d = await db();
  await d.query("select 1");
  if (!staff) {
    return { status: "ok" };
  }
  const pool = await getDbStats();
  return {
    status: "ok",
    uptimeSec: Math.floor(process.uptime()),
    database: {
      kind: pool.kind,
      totalCount: pool.totalCount,
      idleCount: pool.idleCount,
      waitingCount: pool.waitingCount,
      max: pool.max,
    },
  };
});

