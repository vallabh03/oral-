"use client";
import { useEffect, useState } from "react";
import { roleLabels } from "@/lib/domain";
async function request(url: string, mode: string, body?: unknown) {
  const r = await fetch(url, {
    method: body ? "POST" : "GET",
    headers: { "x-care-mode": mode, "Content-Type": "application/json" },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const j: any = await r.json();
  if (!r.ok) throw Error(j.error || "Request failed");
  return j;
}
function download(data: unknown, name: string) {
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }),
  );
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export function SessionGuard({ mode }: { mode: string }) {
  useEffect(() => {
    if (mode !== "live") return;
    let disposed = false,
      lastActivity = Date.now(),
      lastCheck = 0,
      idle = 15 * 60000,
      expires = Infinity,
      busy = false;
    const logout = () => {
      disposed = true;
      fetch("/api/session", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      }).finally(() =>
        window.location.replace("/signout-with-chatgpt?return_to=/workspace"),
      );
    };
    async function check() {
      if (busy || disposed) return;
      busy = true;
      lastCheck = Date.now();
      try {
        const j = await request("/api/session", "live");
        idle = j.policy.idleMinutes * 60000;
        expires = j.expiresAt || Infinity;
      } catch {
        logout();
      } finally {
        busy = false;
      }
    }
    const activity = () => {
      lastActivity = Date.now();
      if (Date.now() - lastCheck > 60000) void check();
    };
    const events = ["pointerdown", "keydown", "touchstart"];
    events.forEach((e) => window.addEventListener(e, activity));
    void check();
    const timer = setInterval(() => {
      if (Date.now() - lastActivity >= idle || Date.now() >= expires) logout();
    }, 1000);
    return () => {
      disposed = true;
      clearInterval(timer);
      events.forEach((e) => window.removeEventListener(e, activity));
    };
  }, [mode]);
  return null;
}
export function AnalyticsPanel({ mode }: { mode: string }) {
  const [data, setData] = useState<any>(null),
    [error, setError] = useState(""),
    [camp, setCamp] = useState(""),
    [group, setGroup] = useState(""),
    [from, setFrom] = useState(""),
    [to, setTo] = useState(""),
    [camps, setCamps] = useState<any[]>([]);
  async function load() {
    setError("");
    try {
      const q = new URLSearchParams({ camp, group, from, to });
      const j = await request("/api/analysis?" + q, mode);
      setData(j);
      setCamps(j.camps || []);
    } catch (e) {
      setData(null);
      setError((e as Error).message);
    }
  }
  useEffect(() => {
    void load();
  }, [mode]);
  return (
    <section className="panel stack">
      <h2>Analysis & reporting</h2>
      <p>
        Count distinct participants across the full authorised dataset. Apply
        registration-date and category filters, then generate a report.
      </p>
      <div className="form-grid">
        <label className="field">
          Camp
          <select value={camp} onChange={(e) => setCamp(e.target.value)}>
            <option value="">All camps</option>
            {camps.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          Category
          <select value={group} onChange={(e) => setGroup(e.target.value)}>
            <option value="">All categories</option>
            {["1", "2", "3", "4", "Unclassified"].map((g) => (
              <option key={g}>{g}</option>
            ))}
          </select>
        </label>
        <label className="field">
          Registered from
          <input
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
          />
        </label>
        <label className="field">
          Registered through
          <input
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
          />
        </label>
      </div>
      <button className="secondary" onClick={load}>
        Apply report filters
      </button>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {data && (
        <>
          <div className="metrics">
            {Object.entries(data.summary).map(([k, v]) => (
              <div className="metric" key={k}>
                <p>{k}</p>
                <strong>{String(v)}</strong>
              </div>
            ))}
          </div>
          {[
            ["Category-wise report", data.byCategory],
            ["Camp-wise report", data.byCamp],
            ["Registration cohorts over time", data.byRegistrationDate],
          ].map(([title, rows]: any) => (
            <div key={title}>
              <h3>{title}</h3>
              <div className="report-table-wrap">
                <table className="report-table">
                  <thead>
                    <tr>
                      <th>Cohort</th>
                      {Object.keys(data.summary).map((k) => (
                        <th key={k}>{k}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r: any) => (
                      <tr key={r.label}>
                        <td>{r.label}</td>
                        {Object.keys(data.summary).map((k) => (
                          <td key={k}>{r[k]}</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
          <h3>Reported habits</h3>
          {data.habits.length ? (
            data.habits.map((r: any) => (
              <div key={r.label} className="habit-row">
                <span>{r.label}</span>
                <meter
                  min={0}
                  max={Math.max(data.summary.registered, 1)}
                  value={r.count}
                />
                <b>{r.count}</b>
              </div>
            ))
          ) : (
            <p>No habit responses in this cohort.</p>
          )}
          <p className="fine">{data.privacy}</p>
          <button
            className="primary"
            onClick={() => download(data, "drive-safe-analysis.json")}
          >
            Export filtered analysis report
          </button>
          <button className="secondary" onClick={() => window.print()}>
            Print statistical summary
          </button>
          <p className="fine">
            Generated {new Date(data.generatedAt).toLocaleString()}
          </p>
        </>
      )}
    </section>
  );
}
export function SystemPanel({ mode }: { mode: string }) {
  const [data, setData] = useState<any>(null),
    [error, setError] = useState(""),
    [message, setMessage] = useState(""),
    [confirmed, setConfirmed] = useState(false);
  const load = () =>
    request("/api/admin", mode)
      .then((j) => setData({ ...j, settings: JSON.parse(j.settings) }))
      .catch((e) => setError(e.message));
  useEffect(() => {
    void load();
  }, [mode]);
  async function save(action: string, body: any) {
    setError("");
    setMessage("");
    try {
      await request("/api/admin", mode, { action, ...body });
      setMessage("Saved and audited.");
      await load();
    } catch (e) {
      setError((e as Error).message);
    }
  }
  return (
    <section className="panel stack">
      <h2>System administration</h2>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {message && <p role="status">{message}</p>}
      {data && (
        <>
          <div className="info-grid">
            {Object.entries(data.status).map(([k, v]) => (
              <div key={k}>
                <small>{k}</small>
                <strong>{String(v)}</strong>
              </div>
            ))}
          </div>
          <h3>Recent system errors</h3>
          {data.errors?.length ? (
            data.errors.map((e: any, i: number) => (
              <p key={i}>
                {e.at} · {e.code}
              </p>
            ))
          ) : (
            <p>No recorded internal errors.</p>
          )}
          <p className="fine">
            Error records contain timestamps and categories only. Detailed
            hosting logs remain restricted to the hosting administrator.
          </p>
          <h3>Session security</h3>
          <div className="form-grid">
            <label className="field">
              Idle timeout (5–60 minutes)
              <input
                type="number"
                min="5"
                max="60"
                value={data.policy.idleMinutes}
                onChange={(e) =>
                  setData({
                    ...data,
                    policy: {
                      ...data.policy,
                      idleMinutes: Number(e.target.value),
                    },
                  })
                }
              />
            </label>
            <label className="field">
              Maximum session (1–12 hours)
              <input
                type="number"
                min="1"
                max="12"
                value={data.policy.absoluteHours}
                onChange={(e) =>
                  setData({
                    ...data,
                    policy: {
                      ...data.policy,
                      absoluteHours: Number(e.target.value),
                    },
                  })
                }
              />
            </label>
          </div>
          <button
            className="secondary"
            disabled={mode === "demo"}
            onClick={() => save("security", { data: data.policy })}
          >
            Save session policy
          </button>
          <p className="fine">
            Password changes, MFA and identity-provider security are managed by
            the identity provider. No passwords or authentication secrets are
            stored in this application.
          </p>
          <h3>Programme contact settings</h3>
          <div className="form-grid">
            {["supportEmail", "supportPhone"].map((k) => (
              <label key={k} className="field">
                {k}
                <input
                  value={data.settings[k]}
                  onChange={(e) =>
                    setData({
                      ...data,
                      settings: { ...data.settings, [k]: e.target.value },
                    })
                  }
                />
              </label>
            ))}
          </div>
          <button
            className="secondary"
            disabled={mode === "demo"}
            onClick={() => save("programme", { data: data.settings })}
          >
            Save contact settings
          </button>
          <h3>Active sessions</h3>
          {data.sessions.length ? (
            data.sessions.map((s: any, i: number) => (
              <div className="record" key={i}>
                <p>
                  {s.user_id} · Last activity{" "}
                  {new Date(s.last_seen).toLocaleString()}
                </p>
                <button
                  className="secondary"
                  onClick={() => save("revokeSessions", { userId: s.user_id })}
                >
                  Revoke this user's sessions
                </button>
              </div>
            ))
          ) : (
            <p>No active sessions to show.</p>
          )}
          <h3>Authorised logical backup export</h3>
          <p>
            Contains identifiable patient records. Private PDF files and session
            secrets are excluded. This is not a complete disaster-recovery
            backup.
          </p>
          <label className="check-label">
            <input
              type="checkbox"
              checked={confirmed}
              onChange={(e) => setConfirmed(e.target.checked)}
            />{" "}
            I will store the export in an authorised encrypted location.
          </label>
          <button
            className="secondary"
            disabled={!confirmed || mode === "demo"}
            onClick={async () => {
              try {
                download(
                  await request("/api/admin?export=backup", mode),
                  "drive-safe-confidential-backup.json",
                );
              } catch (e) {
                setError((e as Error).message);
              }
            }}
          >
            Export authorised system data
          </button>
        </>
      )}
    </section>
  );
}
