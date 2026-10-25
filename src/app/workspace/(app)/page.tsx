import { redirect } from "next/navigation";
import { requireStaff } from "@/lib/server/pageAuth";
import { DASHBOARD_FOR_ROLE } from "@/lib/server/authz";

export default async function WorkspaceHome() {
  const s = await requireStaff();
  redirect(DASHBOARD_FOR_ROLE[s.role]);
}
