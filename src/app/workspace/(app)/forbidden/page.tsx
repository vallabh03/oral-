import Link from "next/link";

export const metadata = { title: "Access denied" };

export default function Forbidden() {
  return (
    <div className="empty-state" role="alert">
      <h1 style={{ fontSize: "var(--step-2)" }}>You don&apos;t have access to that page</h1>
      <p>Your role does not include this area. The attempt has been recorded. Ask a Super Admin if you need access.</p>
      <Link href="/workspace" className="btn btn-primary">Go to my dashboard</Link>
    </div>
  );
}
