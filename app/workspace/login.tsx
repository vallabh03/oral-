"use client";
import { useState } from "react";
export default function Login({ name }: { name: string }) {
  const [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  return (
    <main className="intake-page">
      <p className="eyebrow">TELANGANA AGAINST ORAL CANCER</p>
      <h1>Your secure care workspace</h1>
      <p className="muted">
        Signed in as {name}. Your account determines the dashboard and
        information you can access.
      </p>
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
          {busy ? "Opening…" : "Open my secure dashboard"}
        </button>
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        <p>
          Access is granted by your programme administrator. Patient information
          requires an active, authorised account and a current session.
        </p>
        <a className="secondary" href="/workspace/demo">
          Explore synthetic demonstration
        </a>
        <a href="/signout-with-chatgpt?return_to=/workspace">Sign out</a>
      </section>
    </main>
  );
}
