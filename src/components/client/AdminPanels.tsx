"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { ROLE_LABELS, ROLES, type Role } from "@/lib/shared/constants";
import { postJson, sendJson, type ApiError } from "./api";
import { useConfirm } from "./ConfirmDialog";
import { useToast } from "./Toaster";
import { CopyButton } from "./CopyButton";

type User = { id: string; email: string; display_name: string; role: Role; status: string; mfa_enabled: boolean; camp_scope: string[] | null; last_active: string | null };

export function UsersAdmin({ users, camps, selfId }: { users: User[]; camps: { id: string; name: string }[]; selfId: string }) {
  const router = useRouter();
  const toast = useToast();
  const { confirm, dialog } = useConfirm();
  const [form, setForm] = useState({ email: "", displayName: "", role: "admin" as Role, campId: "" });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [setupUrl, setSetupUrl] = useState("");

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrors({});
    try {
      const r = await postJson<{ setupUrl: string }>("/api/admin/users", { email: form.email, displayName: form.displayName, role: form.role, campScope: form.campId ? [form.campId] : null });
      setSetupUrl(r.setupUrl);
      setForm({ email: "", displayName: "", role: "admin", campId: "" });
      toast("Account created", "success");
      router.refresh();
    } catch (err) {
      const a = err as ApiError;
      if (a.fields) setErrors(a.fields);
      toast(a.message, "error");
    }
  };

  const update = async (u: User, patch: Record<string, unknown>, text: { title: string; body: string; label: string; danger?: boolean }) => {
    if (!(await confirm({ title: text.title, body: text.body, confirmLabel: text.label, danger: text.danger }))) return;
    try {
      await sendJson("PATCH", `/api/admin/users/${u.id}`, patch);
      toast("Saved", "success");
      router.refresh();
    } catch (err) {
      toast((err as ApiError).message, "error");
    }
  };

  return (
    <div className="stack" style={{ "--stack": "24px" } as React.CSSProperties}>
      {dialog}
      <form className="card" onSubmit={create} noValidate aria-labelledby="new-user-h">
        <h2 id="new-user-h" style={{ fontSize: "var(--step-1)" }}>Provision a staff account</h2>
        <div className="form-row">
          <div className="field"><label htmlFor="u-email">Work email</label><input id="u-email" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} aria-invalid={!!errors.email} />{errors.email && <p className="field-error">{errors.email}</p>}</div>
          <div className="field"><label htmlFor="u-name">Display name</label><input id="u-name" type="text" value={form.displayName} onChange={(e) => setForm({ ...form, displayName: e.target.value })} aria-invalid={!!errors.displayName} />{errors.displayName && <p className="field-error">{errors.displayName}</p>}</div>
        </div>
        <div className="form-row">
          <div className="field"><label htmlFor="u-role">Role</label><select id="u-role" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value as Role })}>{ROLES.map((r) => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}</select></div>
          <div className="field"><label htmlFor="u-camp">Limit to camp <span className="opt">(optional)</span></label><select id="u-camp" value={form.campId} onChange={(e) => setForm({ ...form, campId: e.target.value })}><option value="">All camps</option>{camps.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></div>
        </div>
        <button className="btn btn-primary">Create account</button>
        {setupUrl && (
          <div className="callout" style={{ marginTop: 16 }} role="status">
            <p><strong>One-time setup link</strong> (expires in 24 hours). Share it with the user through an approved channel; it is not shown again.</p>
            <CopyButton value={setupUrl} label="Copy setup link" what="Setup link" />
          </div>
        )}
      </form>
      <div className="table-wrap">
        <table className="data responsive">
          <caption className="visually-hidden">Staff accounts</caption>
          <thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Status</th><th>MFA</th><th>Actions</th></tr></thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id}>
                <td data-label="Name">{u.display_name}{u.id === selfId && " (you)"}</td>
                <td data-label="Email">{u.email}</td>
                <td data-label="Role">
                  {u.id === selfId ? ROLE_LABELS[u.role] : (
                    <select aria-label={`Role for ${u.email}`} value={u.role} onChange={(e) => update(u, { role: e.target.value }, { title: `Change role to ${ROLE_LABELS[e.target.value as Role]}?`, body: "The user will be signed out everywhere and must sign in again.", label: "Change role" })}>
                      {ROLES.map((r) => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
                    </select>
                  )}
                </td>
                <td data-label="Status"><span className={`badge ${u.status === "active" ? "badge-ok" : "badge-danger"}`}>{u.status}</span></td>
                <td data-label="MFA">{u.mfa_enabled ? "Enabled" : "Not set up"}</td>
                <td data-label="Actions">
                  {u.id !== selfId && (
                    <span className="cluster" style={{ gap: 6 }}>
                      {u.status === "active" ? (
                        <button className="btn btn-danger btn-sm" onClick={() => update(u, { status: "deactivated" }, { title: `Deactivate ${u.email}?`, body: "All their sessions end immediately and they can no longer sign in.", label: "Deactivate", danger: true })}>Deactivate</button>
                      ) : (
                        <button className="btn btn-ghost btn-sm" onClick={() => update(u, { status: "active" }, { title: `Reactivate ${u.email}?`, body: "They will be able to sign in again.", label: "Reactivate" })}>Reactivate</button>
                      )}
                      {u.mfa_enabled && <button className="btn btn-ghost btn-sm" onClick={() => update(u, { resetMfa: true }, { title: "Reset two-step verification?", body: "Use this only after verifying the person's identity (e.g. a lost phone). They must enrol again.", label: "Reset MFA", danger: true })}>Reset MFA</button>}
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

type Camp = { id: string; code: string; name: string; working_area: string; starts_at: string | null; ends_at: string | null; capacity: number | null; status: string; is_public: boolean };
const empty = { code: "", name: "", workingArea: "", startsAt: "", endsAt: "", capacity: "", status: "planned", isPublic: false };

export function CampsAdmin({ camps }: { camps: Camp[] }) {
  const router = useRouter();
  const toast = useToast();
  const [f, setF] = useState(empty);
  const [editing, setEditing] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const toLocal = (d: string | null) => (d ? new Date(d).toISOString().slice(0, 16) : "");
  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrors({});
    const body = {
      code: f.code, name: f.name, workingArea: f.workingArea, status: f.status, isPublic: f.isPublic,
      startsAt: f.startsAt ? new Date(f.startsAt).toISOString() : null, endsAt: f.endsAt ? new Date(f.endsAt).toISOString() : null,
      capacity: f.capacity ? Number(f.capacity) : null,
    };
    try {
      await (editing ? sendJson("PATCH", `/api/admin/camps/${editing}`, body) : postJson("/api/admin/camps", body));
      toast(editing ? "Camp updated" : "Camp created", "success");
      setF(empty);
      setEditing(null);
      router.refresh();
    } catch (err) {
      const a = err as ApiError;
      if (a.fields) setErrors(a.fields);
      toast(a.message, "error");
    }
  };
  const fe = (k: string) => errors[k] && <p className="field-error">{errors[k]}</p>;
  return (
    <div className="stack" style={{ "--stack": "24px" } as React.CSSProperties}>
      <form className="card" onSubmit={save} noValidate>
        <h2 style={{ fontSize: "var(--step-1)" }}>{editing ? "Edit camp" : "Add a camp"}</h2>
        <div className="form-row">
          <div className="field"><label htmlFor="cp-code">Code</label><input id="cp-code" type="text" value={f.code} onChange={(e) => setF({ ...f, code: e.target.value.toUpperCase() })} placeholder="AMEERPET-01" />{fe("code")}</div>
          <div className="field"><label htmlFor="cp-name">Name</label><input id="cp-name" type="text" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />{fe("name")}</div>
          <div className="field"><label htmlFor="cp-area">Working area</label><input id="cp-area" type="text" value={f.workingArea} onChange={(e) => setF({ ...f, workingArea: e.target.value })} />{fe("workingArea")}</div>
        </div>
        <div className="form-row">
          <div className="field"><label htmlFor="cp-start">Starts</label><input id="cp-start" type="datetime-local" value={f.startsAt} onChange={(e) => setF({ ...f, startsAt: e.target.value })} /></div>
          <div className="field"><label htmlFor="cp-end">Ends</label><input id="cp-end" type="datetime-local" value={f.endsAt} onChange={(e) => setF({ ...f, endsAt: e.target.value })} />{fe("endsAt")}</div>
          <div className="field"><label htmlFor="cp-cap">Capacity</label><input id="cp-cap" type="number" min={1} value={f.capacity} onChange={(e) => setF({ ...f, capacity: e.target.value })} /></div>
        </div>
        <div className="form-row">
          <div className="field"><label htmlFor="cp-status">Status</label><select id="cp-status" value={f.status} onChange={(e) => setF({ ...f, status: e.target.value })}>{["planned", "active", "closed", "cancelled"].map((s) => <option key={s} value={s}>{s}</option>)}</select></div>
          <div className="field"><label className="choice"><input type="checkbox" checked={f.isPublic} onChange={(e) => setF({ ...f, isPublic: e.target.checked })} /> Show on public camps page</label></div>
        </div>
        <div className="cluster"><button className="btn btn-primary">{editing ? "Save changes" : "Add camp"}</button>{editing && <button type="button" className="btn btn-ghost" onClick={() => { setEditing(null); setF(empty); }}>Cancel</button>}</div>
      </form>
      {camps.length === 0 ? <div className="empty-state"><h3>No camps yet</h3><p>Add the first camp above.</p></div> : (
        <div className="table-wrap">
          <table className="data responsive">
            <thead><tr><th>Code</th><th>Name</th><th>Area</th><th>Starts</th><th>Status</th><th>Public</th><th></th></tr></thead>
            <tbody>{camps.map((c) => (
              <tr key={c.id}>
                <td data-label="Code"><code>{c.code}</code></td><td data-label="Name">{c.name}</td><td data-label="Area">{c.working_area}</td>
                <td data-label="Starts">{c.starts_at ? new Date(c.starts_at).toLocaleString("en-IN") : "—"}</td>
                <td data-label="Status"><span className="badge">{c.status}</span></td><td data-label="Public">{c.is_public ? "Yes" : "No"}</td>
                <td data-label=""><button className="btn btn-ghost btn-sm" onClick={() => { setEditing(c.id); setF({ code: c.code, name: c.name, workingArea: c.working_area, startsAt: toLocal(c.starts_at), endsAt: toLocal(c.ends_at), capacity: c.capacity ? String(c.capacity) : "", status: c.status, isPublic: c.is_public }); window.scrollTo({ top: 0 }); }}>Edit</button></td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      )}
    </div>
  );
}

type Session = { id: string; email: string; role: string; created_at: string; last_active_at: string; auth_method: string; mfa_verified: boolean };

export function SessionsAdmin({ sessions, currentSessionId }: { sessions: Session[]; currentSessionId: string }) {
  const router = useRouter();
  const toast = useToast();
  const { confirm, dialog } = useConfirm();
  const revoke = async (s: Session) => {
    if (!(await confirm({ title: `End session for ${s.email}?`, body: "They will be signed out immediately on that device.", confirmLabel: "End session", danger: true }))) return;
    try {
      await sendJson("DELETE", "/api/admin/sessions", { sessionId: s.id });
      toast("Session ended", "success");
      router.refresh();
    } catch (e) {
      toast((e as ApiError).message, "error");
    }
  };
  if (!sessions.length) return <div className="empty-state"><h3>No active sessions</h3></div>;
  return (
    <div className="table-wrap">
      {dialog}
      <table className="data responsive">
        <thead><tr><th>User</th><th>Role</th><th>Method</th><th>Started</th><th>Last active</th><th></th></tr></thead>
        <tbody>{sessions.map((s) => (
          <tr key={s.id}>
            <td data-label="User">{s.email}{s.id === currentSessionId && " (this session)"}</td><td data-label="Role">{s.role}</td>
            <td data-label="Method">{s.auth_method}{s.mfa_verified ? " + MFA" : " (pending MFA)"}</td>
            <td data-label="Started">{new Date(s.created_at).toLocaleString("en-IN")}</td><td data-label="Last active">{new Date(s.last_active_at).toLocaleString("en-IN")}</td>
            <td data-label="">{s.id !== currentSessionId && <button className="btn btn-danger btn-sm" onClick={() => revoke(s)}>End</button>}</td>
          </tr>
        ))}</tbody>
      </table>
    </div>
  );
}
