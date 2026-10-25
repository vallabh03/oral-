import { requireStaff } from "@/lib/server/pageAuth";
import { listCamps } from "@/lib/server/services/admin";
import { CampsAdmin } from "@/components/client/AdminPanels";

export const metadata = { title: "Camps" };

export default async function CampsAdminPage() {
  await requireStaff("camps.manage");
  const camps = await listCamps();
  return (
    <>
      <h1 style={{ fontSize: "var(--step-3)" }}>Screening camps</h1>
      <CampsAdmin camps={JSON.parse(JSON.stringify(camps))} />
    </>
  );
}
