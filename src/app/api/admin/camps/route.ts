import { handler, json } from "@/lib/server/http";
import { campSchema } from "@/lib/server/schemas";
import { listCamps, upsertCamp } from "@/lib/server/services/admin";

// Staff need the camp list to register/filter; only Super Admin may change it.
export const GET = handler({ auth: "staff" }, async () => ({ camps: await listCamps() }));

export const POST = handler({ auth: "staff", permission: "camps.manage", body: campSchema }, async ({ staff, body, correlationId }) =>
  json(await upsertCamp(staff!, body, null, correlationId), 201),
);
