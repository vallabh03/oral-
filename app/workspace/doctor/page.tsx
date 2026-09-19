import Workspace from "../../workspace";
import { protectedDashboard } from "@/lib/page-access";
export const dynamic = "force-dynamic";
export default async function Page() {
  const a = await protectedDashboard("/workspace/doctor");
  return <Workspace initialMode="live" initialRole={a.role} />;
}
