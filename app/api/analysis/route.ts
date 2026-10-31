import {
  actor,
  db,
  requirePermission,
  log,
  rate,
  response,
  failure,
  HttpError,
} from "@/lib/server";
export const dynamic = "force-dynamic";
export async function GET(req: Request) {
  try {
    const a = await actor(req);
    await requirePermission(a, "analytics.read");
    await rate(a);
    const url = new URL(req.url),
      camp = url.searchParams.get("camp") || "",
      group = url.searchParams.get("group") || "",
      from = url.searchParams.get("from") || "",
      to = url.searchParams.get("to") || "";
    if (group && !["1", "2", "3", "4", "Unclassified"].includes(group))
      throw new HttpError(400, "Invalid group.");
    for (const value of [from, to])
      if (value && !/^\d{4}-\d{2}-\d{2}$/.test(value))
        throw new HttpError(400, "Invalid date.");
    if (from && to && from > to)
      throw new HttpError(400, "Start date must precede end date.");
    const terms = ["p.tenant=?"],
      args: any[] = [a.tenant];
    if (camp) {
      terms.push("p.camp_id=?");
      args.push(camp);
    }
    if (group) {
      terms.push(
        group === "Unclassified" ? "p.category IS NULL" : "p.category=?",
      );
      if (group !== "Unclassified") args.push(group);
    }
    if (from) {
      terms.push("p.created_at>=?");
      args.push(from + "T00:00:00.000Z");
    }
    if (to) {
      terms.push("p.created_at<=?");
      args.push(to + "T23:59:59.999Z");
    }
    const where = terms.join(" AND ");
    const rows = (
      await db()
        .prepare(
          `SELECT p.id,p.age,p.driver_type,p.recruitment,p.category,p.pathway,p.camp_id,substr(p.created_at,1,10) day,c.name camp,
 EXISTS(SELECT 1 FROM responses q WHERE q.patient_id=p.id) questionnaire,
 EXISTS(SELECT 1 FROM records r WHERE r.patient_id=p.id AND r.kind='assessment' AND r.status='Clinician verified') screened
 FROM patients p LEFT JOIN camps c ON c.id=p.camp_id WHERE ${where} ORDER BY p.created_at DESC LIMIT 10000`,
        )
        .bind(...args)
        .all<any>()
    ).results;
    const summary = (rs: any[]) => ({
      registered: rs.length,
      questionnaires: rs.filter((r) => r.questionnaire).length,
      screened: rs.filter((r) => r.screened).length,
      categorized: rs.filter((r) => r.category).length,
    });
    const cohorts = (key: string) =>
      [...new Set(rows.map((r) => String(r[key] || "Unrecorded")))]
        .sort()
        .map((value) => ({
          label: value,
          ...summary(
            rows.filter((r) => String(r[key] || "Unrecorded") === value),
          ),
        }));
    const habits = await db()
      .prepare(
        `SELECT q.answer,COUNT(DISTINCT p.id) count FROM responses q JOIN patients p ON p.id=q.patient_id WHERE ${where} AND q.question_id='habits' AND q.at=(SELECT MAX(q2.at) FROM responses q2 WHERE q2.patient_id=p.id AND q2.question_id='habits') GROUP BY q.answer`,
      )
      .bind(...args)
      .all<any>();
    const habitCounts: Record<string, number> = {};
    for (const r of habits.results) {
      let values;
      try {
        values = JSON.parse(r.answer);
      } catch {
        continue;
      }
      if (Array.isArray(values))
        for (const value of new Set(values))
          if (typeof value === "string")
            habitCounts[value] = (habitCounts[value] || 0) + Number(r.count);
    }
    await log(a, "Authorised analytical report generated");
    const camps = (
      await db()
        .prepare("SELECT id,name FROM camps WHERE tenant=? ORDER BY name")
        .bind(a.tenant)
        .all()
    ).results;
    return response({
      camps,
      generatedAt: new Date().toISOString(),
      filters: { camp, group, from, to },
      summary: summary(rows),
      byCamp: [...new Set(rows.map((r) => r.camp_id || "Unrecorded"))].map(
        (id) => ({
          id,
          label:
            rows.find((r) => (r.camp_id || "Unrecorded") === id)?.camp ||
            "Unrecorded",
          ...summary(rows.filter((r) => (r.camp_id || "Unrecorded") === id)),
        }),
      ),
      byCategory: cohorts("category").map((r) => ({
        ...r,
        label: r.label === "Unrecorded" ? "Unclassified" : r.label,
      })),
      byRegistrationDate: cohorts("day"),
      habits: Object.entries(habitCounts).map(([label, count]) => ({
        label,
        count,
      })),
      records: rows.map((r) => ({
        participantId: r.id,
        ageBand:
          r.age == null
            ? "Unknown"
            : `${Math.floor(r.age / 10) * 10}–${Math.floor(r.age / 10) * 10 + 9}`,
        driverType: r.driver_type,
        recruitmentSource: r.recruitment,
        group: r.category,
        pathway: r.pathway,
        camp: r.camp,
        registrationDate: r.day,
        screened: !!r.screened,
      })),
      privacy:
        "Pseudonymous programme analysis only. Screened means clinician-verified assessment. Multi-select habit counts may exceed participant totals. Date trends describe registration cohorts, not incidence or causality.",
    });
  } catch (e) {
    return failure(e);
  }
}
