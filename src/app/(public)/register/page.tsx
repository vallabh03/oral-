import Link from "next/link";
import { pageMetadata } from "@/lib/seo";
import { RegistrationJourney } from "@/components/client/ParticipantJourney";
import { EmptyState } from "@/components/SiteChrome";
import { listCamps } from "@/lib/server/services/admin";
import { config } from "@/lib/server/config";

export const metadata = pageMetadata("register");

export default async function RegisterPage({ searchParams }: { searchParams: Promise<{ mode?: string }> }) {
  const virtual = (await searchParams).mode === "virtual";
  const open = config().INTAKE_ENABLED;
  const camps = open ? (await listCamps({ publicOnly: true }).catch(() => [])).filter((c) => c.status !== "cancelled").map((c) => ({ id: c.id, name: c.name, working_area: c.working_area })) : [];
  return (
    <section className="section">
      <div className="container" style={{ maxWidth: 820 }}>
        <span className="eyebrow">{virtual ? "Virtual screening" : "DRIVE SAFE"}</span>
        <h1>{virtual ? "Register for virtual oral health screening" : "Register for free oral health screening"}</h1>
        {virtual && <p>After you register and answer the questionnaire, the programme team will contact you by phone or video. Please give a phone number so we can reach you. If you choose a camp below, pick the one nearest to you in case an examination is needed.</p>}
        <p className="lede">About one minute to register and two minutes for the questionnaire. Already registered? Use your resume link or <Link href="/register/status">check your status</Link>.</p>
        {open ? (
          <div className="card" style={{ marginTop: 24 }}><RegistrationJourney camps={camps} screeningMode={virtual ? "virtual" : "in_person"} virtualPhotos={config().VIRTUAL_SCREENING_ENABLED} /></div>
        ) : (
          <EmptyState title="Registration opens soon" icon="inbox">
            <p>Participant registration will open once programme approvals are complete. <Link href="/contact">Contact us</Link> to be notified.</p>
          </EmptyState>
        )}
      </div>
    </section>
  );
}
