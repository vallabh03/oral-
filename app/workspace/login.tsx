"use client";
import { T, useT, LanguageSelector } from "@/app/language";
import { useState } from "react";
export default function Login({ name }: { name: string }) {
  const t = useT();
  const [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  return (
    <main className="intake-page"><LanguageSelector />
      <p className="eyebrow"><T text={"TELANGANA AGAINST ORAL CANCER"} /></p>
      <h1><T text={"Your secure care workspace"} /></h1>
      <p className="muted"><T text={"Signed in as "} />{name}<T text={". Your account determines the dashboard and information you can access."} /></p>
      <section className="panel stack">
        <button
          className="primary"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            setError("");
            try {
              const r = await fetch("/api/session", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: "{}",
              });
              const j: any = await r.json();
              if (!r.ok) throw Error(j.error);
              window.location.assign(j.path);
            } catch (e) {
              setError((e as Error).message);
              setBusy(false);
            }
          }}
        >
          <T>{busy ? "Opening…" : "Open my secure dashboard"}</T>
        </button>
        {error && (
          <p className="error" role="alert">
            <T>{error}</T>
          </p>
        )}
        <p><T text={"Access is granted by your programme administrator. Patient information requires an active, authorised account and a current session."} /></p>
        <a className="secondary" href="/workspace/demo"><T text={"Explore synthetic demonstration"} /></a>
        <a href="/signout-with-chatgpt?return_to=/workspace"><T text={"Sign out"} /></a>
      </section>
    </main>
  );
}
