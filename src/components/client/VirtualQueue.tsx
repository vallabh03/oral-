"use client";
import { useCallback, useEffect, useState } from "react";
import { REVIEW_OUTCOMES } from "@/lib/shared/virtual";
import { getJson, type ApiError } from "./api";

type Item = {
  id: string; status: string; statusLabel: string; round: number; submittedAt: string | null; assistance: boolean; outcome: string | null; reviewedAt: string | null;
  displayId: string; fullName: string; age: number; district: string | null; retakes: number; thumbs: string[];
};
const TABS = [
  { value: "awaiting_review", label: "Awaiting review" },
  { value: "help", label: "Help requested" },
  { value: "more_images_requested", label: "Clearer photos requested" },
  { value: "awaiting_images", label: "Waiting for photos" },
  { value: "reviewed", label: "Reviewed" },
] as const;
const fmt = (d: string | null) => (d ? new Date(d).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Kolkata" }) : "—");

/** Doctor review queue: oldest submissions first, photos shown directly on each card. */
export function VirtualQueue() {
  const [tab, setTab] = useState<(typeof TABS)[number]["value"]>("awaiting_review");
  const [items, setItems] = useState<Item[]>([]);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setState("loading");
    try {
      setItems((await getJson<{ items: Item[] }>(`/api/virtual/cases?status=${tab}`)).items);
      setState("ready");
    } catch (e) {
      setError((e as ApiError).message);
      setState("error");
    }
  }, [tab]);
  useEffect(() => { void load(); }, [load]);

  return (
    <div className="stack" style={{ "--stack": "16px" } as React.CSSProperties}>
      <div className="mode-tabs" role="group" aria-label="Queue">
        {TABS.map((t) => <button key={t.value} type="button" aria-pressed={tab === t.value} className={tab === t.value ? "active" : ""} onClick={() => setTab(t.value)}>{t.label}</button>)}
      </div>
      {state === "loading" && <div className="vq-grid" aria-busy="true" aria-label="Loading cases">{Array.from({ length: 4 }, (_, i) => <div key={i} className="skeleton" style={{ height: 180 }} />)}</div>}
      {state === "error" && <div className="error-summary" role="alert"><p style={{ margin: 0 }}>{error}</p><button className="btn btn-primary btn-sm" style={{ marginTop: 8 }} onClick={() => void load()}>Try again</button></div>}
      {state === "ready" && items.length === 0 && <div className="empty-state" role="status"><h2>Nothing here</h2><p>No virtual cases in this list right now.</p></div>}
      {state === "ready" && items.length > 0 && (
        <>
          <p className="hint" role="status">{items.length} case{items.length === 1 ? "" : "s"}{tab === "awaiting_review" ? " — oldest first" : ""}</p>
          <ul className="vq-grid" style={{ listStyle: "none", padding: 0, margin: 0 }}>
            {items.map((c) => (
              // Full page load (not a client transition): always fetches a fresh, audited case view.
              <li key={c.id}>
                <a href={`/workspace/virtual/${c.id}`} className="vq-card">
                  <span className="vq-thumbs">
                    {c.thumbs.length ? c.thumbs.map((t) => <img key={t} src={t} alt="" loading="lazy" decoding="async" />) : <span className="hint">No photos yet</span>}
                  </span>
                  <span className="vq-meta">
                    <strong>{c.fullName}</strong>
                    <span><span className="code-chip">{c.displayId}</span> · Age {c.age}{c.district ? ` · ${c.district}` : ""}</span>
                    <span className="hint">Submitted {fmt(c.submittedAt)}{c.round > 1 ? ` · round ${c.round}` : ""}</span>
                    <span className="cluster" style={{ gap: 6 }}>
                      <span className="badge">{c.statusLabel}</span>
                      {c.assistance && <span className="badge badge-warn">Help requested</span>}
                      {c.retakes > 0 && <span className="badge badge-danger">{c.retakes} retake{c.retakes === 1 ? "" : "s"}</span>}
                      {c.outcome && <span className={`badge ${c.outcome === "suspicious" ? "badge-danger" : c.outcome === "no_suspicious" ? "badge-ok" : "badge-warn"}`}>{REVIEW_OUTCOMES.find((o) => o.value === c.outcome)?.label.split(" — ")[0]}</span>}
                    </span>
                  </span>
                </a>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
