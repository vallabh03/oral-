import { requireStaff } from "@/lib/server/pageAuth";
import { listCamps, listUsers } from "@/lib/server/services/admin";
import { UsersAdmin } from "@/components/client/AdminPanels";

export const metadata = { title: "Staff & roles" };

export default async function UsersPage() {
  const staff = await requireStaff("users.manage");
  const [users, camps] = await Promise.all([listUsers(), listCamps()]);
  return (
    <>
      <h1 style={{ fontSize: "var(--step-3)" }}>Staff &amp; roles</h1>
      <p className="hint">Accounts are pre-provisioned only. Role changes sign the user out everywhere and are audited. You cannot change your own role.</p>
      <UsersAdmin users={JSON.parse(JSON.stringify(users))} camps={camps.map((c) => ({ id: c.id, name: c.name }))} selfId={staff.userId} />
    </>
  );
}
