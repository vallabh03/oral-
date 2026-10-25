import { handler } from "@/lib/server/http";
import { exportSchema } from "@/lib/server/schemas";
import { conversionCounts, dashboardCounts } from "@/lib/server/services/admin";

export const GET = handler({ auth: "staff", permission: "analytics.read" }, async ({ req, staff }) => {
  const filters = exportSchema.parse(Object.fromEntries(req.nextUrl.searchParams));
  const data = await dashboardCounts(staff!, filters);
  return { ...data, conversions: staff!.role === "super_admin" ? await conversionCounts() : undefined };
});
