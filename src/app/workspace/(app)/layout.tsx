import Link from "next/link";
import { requireStaff } from "@/lib/server/pageAuth";
import { ROLE_LABELS, type Role } from "@/lib/shared/constants";
import { Logo } from "@/components/Logo";
import { ThemeToggle } from "@/components/client/ThemeToggle";
import { WorkspaceNav, IdleLogout, LogoutButton } from "@/components/client/WorkspaceChrome";

const NAV: Record<Role, { href: string; label: string; icon: string }[]> = {
  admin: [
    { href: "/workspace/admin", label: "Dashboard", icon: "grid" },
    { href: "/workspace/patients", label: "Participants", icon: "users" },
    { href: "/workspace/patients/new", label: "Register participant", icon: "plus" },
  ],
  super_admin: [
    { href: "/workspace/super-admin", label: "Overview", icon: "grid" },
    { href: "/workspace/patients", label: "Participants", icon: "users" },
    { href: "/workspace/super-admin/users", label: "Staff & roles", icon: "shield" },
    { href: "/workspace/super-admin/camps", label: "Camps", icon: "map" },
    { href: "/workspace/super-admin/sessions", label: "Sessions", icon: "user" },
    { href: "/workspace/super-admin/audit", label: "Audit & errors", icon: "alert" },
    { href: "/workspace/assistant", label: "Analytics", icon: "chart" },
  ],
  assistant: [{ href: "/workspace/assistant", label: "Analytics", icon: "chart" }],
};

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const staff = await requireStaff();
  return (
    <>
      {/* Per-session anti-CSRF token for same-origin fetches (paired with Origin checks). */}
      <meta name="csrf-token" content={staff.csrfToken} />
      <header className="site-header">
        <div className="container-wide bar">
          <Link href="/workspace" className="brand"><Logo height={40} priority /><span className="brand-name ws-label">DRIVE SAFE<small>Staff workspace</small></span></Link>
          <div className="header-actions">
            <span className="badge badge-brand" title={staff.email}>{ROLE_LABELS[staff.role]}</span>
            <ThemeToggle />
            <LogoutButton />
          </div>
        </div>
      </header>
      <div className="ws-shell">
        <aside className="ws-side" aria-label="Workspace">
          <WorkspaceNav items={NAV[staff.role]} variant="side" />
          <p className="hint" style={{ padding: "16px 12px" }}>Signed in as {staff.displayName}</p>
        </aside>
        <div style={{ minWidth: 0 }}>
          <WorkspaceNav items={NAV[staff.role]} variant="tabs" />
          <main id="main" tabIndex={-1} className="ws-main"><div className="inner">{children}</div></main>
        </div>
      </div>
      <IdleLogout minutes={15} />
    </>
  );
}
