"use client";
import { T, useT, LanguageSelector } from "@/app/language";
import { useState, useEffect } from "react";
import { Activity, ArrowLeft, ShieldCheck } from "lucide-react";
import { api } from "../care-ui";
import { Registration, Questionnaire } from "../intake";
export default function Register() {
  const t = useT();
  const [data, setData] = useState<any>(null),
    [id, setId] = useState(""),
    [token, setToken] = useState(""),
    [error, setError] = useState(""),
    [live, setLive] = useState(false);
  useEffect(() => {
    async function load() {
      try {
        const r = await fetch("/api/intake");
        const j: any = await r.json();
        if (j.enabled) {
          setLive(true);
          setData(j);
        } else {
          await api("seed", {});
          setData(await api());
        }
      } catch (e) {
        setError((e as Error).message);
      }
    }
    void load();
  }, []);
  async function submit(action: string, body: any) {
    if (!live) return api(action, body);
    const r = await fetch("/api/intake", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, ...body }),
    });
    const j: any = await r.json();
    if (!r.ok) throw new Error(j.error);
    return j;
  }
  return (
    <main className="intake-page"><LanguageSelector />
      <a className="brand" href="/campaign">
        <span className="brand-mark">
          <Activity />
        </span>
        <span><T text={"TELANGANA"} /><span><T text={"AGAINST ORAL CANCER"} /></span>
        </span>
      </a>
      <p className="eyebrow"><T text={"DRIVE SAFE · PARTICIPANT ENTRY"} /></p>
      <h1>
        <T>{id
          ? "A few questions about your oral health."
          : "Your screening journey starts here."}</T>
      </h1>
      <p className="muted"><T text={"For Telangana’s auto and taxi drivers."} /></p>
      <section className="panel">
        {!live && (
          <div className="notice">
            <ShieldCheck size={18} />
            <span><T text={"Pilot evaluation only. Live participant intake is not yet open."} /></span>
          </div>
        )}
        {error ? (
          <div className="stack">
            <p className="error"><T text={error} /></p>
            <a
              className="primary"
              target="_top"
              href="/signin-with-chatgpt?return_to=/register"
            ><T text={"Sign in to evaluate the demo"} /></a>
          </div>
        ) : !data ? (
          <p><T text={"Preparing registration…"} /></p>
        ) : id ? (
          <div className="stack">
            <p className="notice"><T text={"Registration saved · Your ID:"} />{" "}
              <span className="patient-id">{id}</span>
            </p>
            <Questionnaire
              protocol={live ? data.protocol : data.protocols[0].definition}
              submit={(answers) =>
                submit("screen", {
                  patientId: id,
                  token,
                  protocolId: live ? data.protocolId : data.protocols[0].id,
                  answers,
                })
              }
            />
          </div>
        ) : (
          <Registration
            camps={data.camps}
            demo={!live}
            privacyNotice={data.privacyNotice}
            consentVersion={data.consentVersion}
            save={async (d) => {
              const r = await submit("register", { data: d });
              setId(r.id);
              setToken(r.token || "");
              window.scrollTo(0, 0);
            }}
          />
        )}
      </section>
      <a className="text-button" href="/campaign">
        <ArrowLeft size={15} /><T text={" Back to the programme"} /></a>
    </main>
  );
}
