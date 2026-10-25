import { handler, json } from "@/lib/server/http";
import { createUserSchema } from "@/lib/server/schemas";
import { LIMITS } from "@/lib/server/security/rateLimit";
import { createUser, listUsers } from "@/lib/server/services/admin";

export const GET = handler({ auth: "staff", permission: "users.manage" }, async () => ({ users: await listUsers() }));

export const POST = handler(
  { auth: "staff", permission: "users.manage", body: createUserSchema, rateLimit: [{ limit: LIMITS.staffWrite, by: "user" }] },
  async ({ staff, body, correlationId }) => json(await createUser(staff!, body, correlationId), 201),
);
