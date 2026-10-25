import { requireStaff } from "@/lib/server/pageAuth";
import { listCamps } from "@/lib/server/services/admin";
import { PatientList } from "@/components/client/PatientList";
import { can } from "@/lib/server/authz";

export const metadata = { title: "Participants" };

export default async function PatientsPage() {
  const staff = await requireStaff("patient.search");
  const camps = (await listCamps()).filter((c) => !staff.campScope || staff.campScope.includes(c.id)).map((c) => ({ id: c.id, name: c.name }));
  return (
    <>
      <h1 style={{ fontSize: "var(--step-3)" }}>Participants</h1>
      <PatientList camps={camps} canCreate={can(staff.role, "patient.create")} />
    </>
  );
}
