export function StatGrid({ items }: { items: { label: string; value: number | string }[] }) {
  return (
    <div className="stat-grid">
      {items.map((i) => (
        <div key={i.label} className="stat"><div className="num">{i.value}</div><div className="lbl">{i.label}</div></div>
      ))}
    </div>
  );
}

/** Accessible horizontal bar chart: values are always printed, colour is never the only cue. */
export function BarList({ title, rows }: { title: string; rows: { label: string; value: number }[] }) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  return (
    <figure className="card" style={{ margin: 0 }}>
      <figcaption style={{ fontWeight: 700, marginBottom: 12 }}>{title}</figcaption>
      {rows.length === 0 ? <p className="hint">No data yet.</p> : (
        <ul style={{ listStyle: "none", padding: 0, margin: 0 }} className="stack">
          {rows.map((r) => (
            <li key={r.label}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 8, fontSize: "0.9rem" }}><span>{r.label}</span><strong>{r.value}</strong></div>
              <div className="progress-bar" aria-hidden="true"><span style={{ "--w": `${(r.value / max) * 100}%` } as React.CSSProperties} /></div>
            </li>
          ))}
        </ul>
      )}
    </figure>
  );
}
