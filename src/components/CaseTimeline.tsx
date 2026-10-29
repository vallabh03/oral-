// The virtual screening timeline (registration to follow-up), shown to the patient and the doctor.
// Each step is its own status: consent, capture, upload and review are never merged.

export type TimelineItem = { key: string; label: string; at: string | null; optional?: boolean };

const fmt = (d: string) => new Date(d).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Kolkata" });

export function CaseTimeline({ events, title = "Progress" }: { events: TimelineItem[]; title?: string }) {
  return (
    <section aria-label={title} className="case-timeline">
      <h2 className="vr-h">{title}</h2>
      <ol>
        {events.map((e) => (
          <li key={e.key} className={e.at ? "is-done" : "is-pending"}>
            <span className="ct-dot" aria-hidden="true">{e.at ? "✓" : ""}</span>
            <span className="ct-label">{e.label}</span>
            <span className="ct-time">{e.at ? fmt(e.at) : "Not yet"}</span>
          </li>
        ))}
      </ol>
    </section>
  );
}
