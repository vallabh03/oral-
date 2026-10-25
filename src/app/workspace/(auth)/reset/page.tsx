import { ResetFlow } from "@/components/client/ResetFlow";

export const metadata = { title: "Reset password", referrer: "no-referrer" as const };

export default function ResetPage() {
  return (
    <div className="auth-card card">
      <h1 style={{ fontSize: "var(--step-3)" }}>Set or reset your password</h1>
      <ResetFlow />
    </div>
  );
}
