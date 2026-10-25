import { redirect } from "next/navigation";
import { getStaff } from "@/lib/server/pageAuth";
import { config } from "@/lib/server/config";
import { DASHBOARD_FOR_ROLE } from "@/lib/server/authz";
import { LoginFlow } from "@/components/client/LoginFlow";

export const metadata = { title: "Staff sign-in" };

const ERRORS: Record<string, string> = {
  not_authorised: "Your account is not authorised for this workspace. Contact a Super Admin.",
  oidc_state: "Sign-in expired. Please try again.",
};

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string; signed_out?: string }> }) {
  const s = await getStaff();
  if (s) redirect(DASHBOARD_FOR_ROLE[s.role]);
  const sp = await searchParams;
  const c = config();
  return (
    <div className="auth-card card">
      <h1 style={{ fontSize: "var(--step-3)" }}>Staff sign-in</h1>
      <p className="hint" style={{ marginBottom: 20 }}>For pre-approved programme staff only. All access is logged.</p>
      {sp.signed_out && <p className="success-state" role="status" style={{ padding: 12 }}>You have been signed out.</p>}
      {sp.error && <p className="error-summary" role="alert" style={{ padding: 12 }}>{ERRORS[sp.error] ?? "Sign-in failed. Please try again."}</p>}
      <LoginFlow passwordEnabled={c.AUTH_PASSWORD_ENABLED} oidcEnabled={c.OIDC_ENABLED} />
    </div>
  );
}
