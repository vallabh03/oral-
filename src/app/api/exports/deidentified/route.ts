import { NextResponse } from "next/server";
import { handler } from "@/lib/server/http";
import { exportSchema } from "@/lib/server/schemas";
import { LIMITS } from "@/lib/server/security/rateLimit";
import { deidentifiedExport } from "@/lib/server/services/admin";

export const GET = handler(
  { auth: "staff", permission: "export.deidentified", rateLimit: [{ limit: LIMITS.export, by: "user" }] },
  async ({ req, staff, correlationId }) => {
    const filters = exportSchema.parse(Object.fromEntries(req.nextUrl.searchParams));
    const csv = await deidentifiedExport(staff!, filters, correlationId);
    return new NextResponse(csv, {
      headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": `attachment; filename="drive-safe-deidentified-${new Date().toISOString().slice(0, 10)}.csv"`, "cache-control": "no-store" },
    });
  },
);
