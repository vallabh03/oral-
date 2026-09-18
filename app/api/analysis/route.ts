import {
  actor,
  db,
  requireRole,
  log,
  rate,
  response,
  failure,
} from "@/lib/server";
export const dynamic = "force-dynamic";
export async function GET(req: Request) {
  try {
    const a = await actor(req);
    requireRole(a, "ADMIN");
    await rate(a);
    const p = await db()
      .prepare(
        "SELECT id,age,driver_type,recruitment,category,pathway FROM patients WHERE tenant=?",
      )
      .bind(a.tenant)
      .all<any>();
    await log(a, "De-identified programme analysis exported");
    return response({
      records: p.results.map((r) => ({
        programme: "DRIVE SAFE",
        participantId: r.id,
        ageBand:
          r.age == null
            ? "Unknown"
            : `${Math.floor(r.age / 10) * 10}–${Math.floor(r.age / 10) * 10 + 9}`,
        driverType: r.driver_type,
        recruitmentSource: r.recruitment,
        group: r.category,
        pathway: r.pathway,
      })),
      privacy: "Pseudonymous data; authorized programme analysis only.",
    });
  } catch (e) {
    return failure(e);
  }
}
