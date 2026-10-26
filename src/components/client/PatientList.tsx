"use client";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { PATIENT_STATUSES, SCREENING_MODES, STATUS_LABELS } from "@/lib/shared/constants";
import { getJson, type ApiError } from "./api";
import { QrScanner } from "./QrScanner";

type Item = {
  id: string; displayId: string; fullName: string; age: number; campName: string | null; status: keyof typeof STATUS_LABELS;
  groupCode: number | null; screeningMode: "in_person" | "virtual"; createdAt: string; photo: { thumbUrl: string } | null;
};

/** Record list with photos: keyset-paginated, thumbnails lazy-loaded and browser-cached. */
export function PatientList({ camps, canCreate }: { camps: { id: string; name: string }[]; canCreate: boolean }) {
  const [q, setQ] = useState("");
  const [campId, setCampId] = useState("");
  const [status, setStatus] = useState("");
  const [mode, setMode] = useState(""); // "" = all; otherwise one screening type, so the two are kept apart
  const [items, setItems] = useState<Item[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "more" | "error">("loading");
  const [error, setError] = useState("");
  const [privacy, setPrivacy] = useState(false);
  const [scan, setScan] = useState(false);
  const req = useRef(0);

  useEffect(() => {
    try { setPrivacy(localStorage.getItem("ws-privacy") === "1"); } catch {}
  }, []);

  const load = useCallback(async (opts: { append?: boolean; cursor?: string | null; query?: string } = {}) => {
    const id = ++req.current;
    setState(opts.append ? "more" : "loading");
    const p = new URLSearchParams({ limit: "24" });
    const query = opts.query ?? q;
    if (query.trim()) p.set("q", query.trim());
    if (campId) p.set("campId", campId);
    if (status) p.set("status", status);
    if (mode) p.set("mode", mode);
    if (opts.cursor) p.set("cursor", opts.cursor);
    try {
      const r = await getJson<{ items: Item[]; nextCursor: string | null }>(`/api/patients?${p}`);
      if (id !== req.current) return;
      setItems((prev) => (opts.append ? [...prev, ...r.items] : r.items));
      setCursor(r.nextCursor);
      setState("ready");
    } catch (e) {
      if (id !== req.current) return;
      setError((e as ApiError).message);
      setState("error");
    }
  }, [q, campId, status, mode]);

  useEffect(() => { void load(); }, [campId, status, mode]); // eslint-disable-line react-hooks/exhaustive-deps

  const togglePrivacy = () => {
    setPrivacy((p) => {
      try { localStorage.setItem("ws-privacy", p ? "0" : "1"); } catch {}
      return !p;
    });
  };

  return (
    <div className={privacy ? "privacy-blur" : ""}>
      <div className="mode-tabs" role="group" aria-label="Screening type">
        {[{ value: "", label: "All participants" }, ...SCREENING_MODES].map((m) => (
          <button key={m.value} type="button" aria-pressed={mode === m.value} className={mode === m.value ? "active" : ""} onClick={() => setMode(m.value)}>{m.label}</button>
        ))}
      </div>
      <form className="toolbar" role="search" onSubmit={(e) => { e.preventDefault(); void load(); }}>
        <div className="field">
          <label htmlFor="pq">Search <span className="hint">Participant ID, 10-digit mobile, exact full name, or scan QR</span></label>
          <input id="pq" type="search" value={q} onChange={(e) => setQ(e.target.value)} maxLength={64} placeholder="e.g. HAOC-DS-0012" autoComplete="off" />
        </div>
        <div className="field" style={{ flex: "0 1 200px" }}>
          <label htmlFor="pcamp">Camp</label>
          <select id="pcamp" value={campId} onChange={(e) => setCampId(e.target.value)}>
            <option value="">All camps</option>
            {camps.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
        <div className="field" style={{ flex: "0 1 220px" }}>
          <label htmlFor="pstatus">Status</label>
          <select id="pstatus" value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">Any status</option>
            {PATIENT_STATUSES.map((s) => <option key={s} value={s}>{STATUS_LABELS[s]}</option>)}
          </select>
        </div>
        <button className="btn btn-primary" type="submit">Search</button>
        <button className="btn btn-ghost" type="button" onClick={() => setScan((s) => !s)} aria-expanded={scan}>Scan QR</button>
        <button className="btn btn-ghost" type="button" onClick={togglePrivacy} aria-pressed={privacy} title="Blur names and photos on shared screens">{privacy ? "Show details" : "Privacy screen"}</button>
        {canCreate && <Link href="/workspace/patients/new" className="btn btn-secondary">Register new</Link>}
      </form>
      {scan && <QrScanner onResult={(token) => { setScan(false); setQ(token); void load({ query: token }); }} />}

      {state === "loading" && (
        <div className="patient-cards" aria-busy="true" aria-label="Loading participants">
          {Array.from({ length: 8 }, (_, i) => (
            <div key={i} className="patient-card"><div className="skeleton avatar" /><div className="stack" style={{ "--stack": "8px" } as React.CSSProperties}><div className="skeleton" style={{ height: 16, width: "70%" }} /><div className="skeleton" style={{ height: 14, width: "50%" }} /></div></div>
          ))}
        </div>
      )}
      {state === "error" && <div className="error-summary" role="alert"><p style={{ margin: 0 }}>{error}</p><button className="btn btn-primary btn-sm" style={{ marginTop: 8 }} onClick={() => void load()}>Try again</button></div>}
      {(state === "ready" || state === "more") && items.length === 0 && (
        <div className="empty-state" role="status">
          <h2>No participants found</h2>
          <p>{q ? "Check the ID or mobile number, or use the exact full name. Search never matches partial names to protect privacy." : "No records match these filters yet."}</p>
          {canCreate && <Link className="btn btn-primary" href="/workspace/patients/new">Register a participant</Link>}
        </div>
      )}
      {items.length > 0 && state !== "loading" && (
        <>
          <p className="hint" role="status">{items.length} shown{cursor ? " — more available" : ""}</p>
          <ul className="patient-cards" style={{ listStyle: "none", padding: 0 }}>
            {items.map((p) => (
              <li key={p.id}>
                <Link href={`/workspace/patients/${p.id}`} className="patient-card">
                  <span className="avatar">
                    {p.photo ? <img src={p.photo.thumbUrl} alt={`Photo of ${p.fullName}`} width={72} height={72} loading="lazy" decoding="async" /> : <span aria-hidden="true">{p.fullName.slice(0, 1).toUpperCase()}</span>}
                  </span>
                  <span style={{ minWidth: 0 }}>
                    <strong className="pii" style={{ display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.fullName}</strong>
                    <span className="code-chip" style={{ fontSize: "0.8rem" }}>{p.displayId}</span>{" "}
                    <span className="hint" style={{ display: "inline" }}>Age {p.age}{p.campName ? ` · ${p.campName}` : ""}</span>
                    <span style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 6 }}>
                      <span className={`badge ${p.screeningMode === "virtual" ? "badge-virtual" : "badge-inperson"}`}>{p.screeningMode === "virtual" ? "Virtual" : "In person"}</span>
                      <span className="badge">{STATUS_LABELS[p.status]}</span>
                      {p.groupCode && <span className="badge badge-brand">Group {p.groupCode}</span>}
                      {!p.photo && <span className="badge badge-warn">No photo</span>}
                    </span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
          {cursor && (
            <div style={{ textAlign: "center", marginTop: 20 }}>
              <button className="btn btn-secondary" onClick={() => void load({ append: true, cursor })} disabled={state === "more"}>{state === "more" ? "Loading…" : "Load more"}</button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
