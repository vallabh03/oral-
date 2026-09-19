import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { actor } from "@/lib/server";
import { dashboardPath } from "@/lib/permissions";
export async function protectedDashboard(path: string) {
  const h = new Headers(await headers());
  h.set("x-care-mode", "live");
  let a;
  try {
    a = await actor(new Request("https://app.local" + path, { headers: h }));
  } catch {
    redirect("/workspace?session=required");
  }
  if (dashboardPath(a.role) !== path) redirect(dashboardPath(a.role));
  return a;
}
