import { z } from "zod";
import { handler } from "@/lib/server/http";
import { recentAudit, recentErrors, systemDiagnostics } from "@/lib/server/services/admin";
import { verifyAuditChain } from "@/lib/server/audit";

const q = z.object({
  action: z.string().regex(/^[a-z_.]{1,40}$/).optional(),
  actorId: z.string().uuid().optional(),
  target: z.string().uuid().optional(),
  outcome: z.enum(["success", "denied", "failure"]).optional(),
  limit: z.coerce.number().int().min(1).max(500).default(100),
  verify: z.enum(["1"]).optional(),
  errors: z.enum(["1"]).optional(),
  diagnostics: z.enum(["1"]).optional(),
});

export const GET = handler({ auth: "staff", permission: "audit.read" }, async ({ req }) => {
  const p = q.parse(Object.fromEntries(req.nextUrl.searchParams));
  if (p.verify) return verifyAuditChain();
  if (p.errors) return { errors: await recentErrors() };
  if (p.diagnostics) return { diagnostics: await systemDiagnostics() };
  return { events: await recentAudit(p) };
});
