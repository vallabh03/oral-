import Link from "next/link";
import { pageMetadata } from "@/lib/seo";
import { RegistrationJourney } from "@/components/client/ParticipantJourney";
import { EmptyState } from "@/components/SiteChrome";
import { listCamps } from "@/lib/server/services/admin";
import { config } from "@/lib/server/config";

export const metadata = pageMetadata("register");

export default async function RegisterPage() {
  const open = config().INTAKE_ENABLED;
  const camps = open ? (await listCamps({ publicOnly: true }).catch(() => [])).filter((c) => c.status !== "cancelled").map((c) => ({ id: c.id, name: c.name, working_area: c.working_area })) : [];
  return (
    <section className="section">
      <div className="container" style={{ maxWidth: 820 }}>
        <span className="eyebrow">DRIVE SAFE</span>
        <h1>Register for free oral health screening</h1>
        <p className="lede">About one minute to register and two minutes for the questionnaire. Already registered? Use your resume link or <Link href="/register/status">check your status</Link>.</p>
        {open ? (
          <div className="card" style={{ marginTop: 24 }}><RegistrationJourney camps={camps} /></div>
        ) : (
          <EmptyState title="Registration opens soon" icon="inbox">
            <p>Participant registration will open once programme approvals are complete. <Link href="/contact">Contact us</Link> to be notified.</p>
          </EmptyState>
        )}
      </div>
    </section>
  );
}
