import Link from "next/link";
import { Logo } from "@/components/Logo";
import { ThemeToggle } from "@/components/client/ThemeToggle";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <header className="site-header">
        <div className="container-wide bar">
          <Link href="/" className="brand"><Logo height={40} priority /><span className="brand-name ws-label">DRIVE SAFE<small>Staff workspace</small></span></Link>
          <div className="header-actions"><ThemeToggle /></div>
        </div>
      </header>
      <main id="main" tabIndex={-1} className="auth-wrap">{children}</main>
    </>
  );
}
