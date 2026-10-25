// Loading skeleton for every workspace page while server data is fetched (FR-PUB-12).
export default function Loading() {
  return (
    <div aria-busy="true" aria-label="Loading" className="stack" style={{ "--stack": "16px" } as React.CSSProperties}>
      <div className="skeleton" style={{ height: 36, width: "40%" }} />
      <div className="stat-grid">{Array.from({ length: 6 }, (_, i) => <div key={i} className="skeleton" style={{ height: 88 }} />)}</div>
      <div className="skeleton" style={{ height: 240 }} />
    </div>
  );
}
