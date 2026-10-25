import "server-only";
import crypto from "node:crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { can, type Permission } from "./authz";
import { audit } from "./audit";
import { readStaffSession, staffCookieName, type StaffSession } from "./security/session";

/** Server-component guard: validates the session on every render; never trusts client state. */
export async function getStaff(): Promise<StaffSession | null> {
  const token = (await cookies()).get(staffCookieName())?.value;
  const s = await readStaffSession(token);
  return s && s.mfaVerified ? s : null;
}

export async function requireStaff(permission?: Permission): Promise<StaffSession> {
  const s = await getStaff();
  if (!s) redirect("/workspace/login");
  if (permission && !can(s.role, permission)) {
    await audit({ actorType: "staff", actorId: s.userId, action: "permission.denied", outcome: "denied", correlationId: crypto.randomUUID(), code: permission, details: { surface: "page" } });
    redirect("/workspace/forbidden");
  }
  return s;
}
