"use client";
import { hasRole, roleLabels, accountTypes } from "@/lib/domain";
import { useState, useEffect } from "react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Field, Choice, Check, Modal, QRImage, api } from "./care-ui";
import { Questionnaire } from "./intake";
import {
  findings,
  impressions,
  sites,
  groupPaths,
  sampleStates,
} from "@/lib/domain";
import {
  ShieldCheck,
  Plus,
  FileText,
  Clock,
  ArrowRight,
  ScanLine,
} from "lucide-react";
export default function PatientProfile({
  id,
  mode,
  protocols,
  users,
  role,
  demo,
  changed,
}: {
  id: string;
  mode: string;
  protocols: any[];
  users: any[];
  role: string;
  demo: boolean;
  changed: () => void;
}) {
  const [data, setData] = useState<any>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [action, setAction] = useState(""),
    [token, setToken] = useState(""),
    [editRecord, setEditRecord] = useState<any>(null);
  async function refresh() {
    const r = await fetch("/api/care?patient=" + encodeURIComponent(id), {
      headers: { "x-care-mode": mode },
    });
    const d: any = await r.json();
    if (!r.ok) throw new Error(d.error);
    setData(d);
  }
  useEffect(() => {
    setData(null);
    refresh().catch((e) => setError(e.message));
  }, [id, mode]);
  async function save(action: string, body: any) {
    setError("");
    setBusy(true);
    try {
      const result = await api(action, { patientId: id, ...body }, mode);
      await refresh();
      changed();
      setAction("");
      return result;
    } catch (e) {
      setError((e as Error).message);
      throw e;
    } finally {
      setBusy(false);
    }
  }
  const can = (...r: string[]) => demo || hasRole(role, ...r);
  if (!data)
    return (
      <p className={error ? "error" : "muted"}>
        {error || "Loading authorized patient record…"}
      </p>
    );
  const p = data.patient;
  const currentProtocol =
    protocols.find((p) => p.status === "Approved") ||
    (demo ? protocols[0] : null);
  return (
    <div className="stack">
      <div className="profile-summary">
        <span className="avatar large">
          {p.name
            ?.split(" ")
            .map((v: string) => v[0])
            .slice(0, 2)
            .join("")}
        </span>
        <div>
          <h2>{p.name}</h2>
          <p className="patient-id">{p.id}</p>
          <p className="muted">
            {p.age != null ? p.age + " years · " : ""}
            {p.driver_type || "DRIVE SAFE participant"}
          </p>
        </div>
        {p.category && <span className="badge">Group {p.category}</span>}
      </div>
      <div className="info-grid">
        <div>
          <small>Mobile</small>
          <strong>{p.phone || "Not recorded"}</strong>
        </div>
        <div>
          <small>Working area</small>
          <strong>{p.working_area || "Not recorded"}</strong>
        </div>
        <div>
          <small>Current pathway</small>
          <strong>{p.pathway || "Laboratory access"}</strong>
        </div>
      </div>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <Tabs defaultValue="overview">
        <TabsList className="profile-tabs">
          {[
            "overview",
            "screening",
            "examination",
            "care",
            "testing",
            "consent",
            "timeline",
          ]
            .filter((t) => {
              if (can("ADMIN", "DOCTOR", "ASSISTANT")) return true;
              if (role === "REGISTRATION")
                return ["overview", "screening", "consent"].includes(t);
              if (role === "LAB") return ["overview", "testing"].includes(t);
              if (role === "COUNSELLOR")
                return ["overview", "screening", "care"].includes(t);
              return ["overview", "testing", "care"].includes(t);
            })
            .map((t) => (
              <TabsTrigger value={t} key={t}>
                {t.charAt(0).toUpperCase() + t.slice(1)}
              </TabsTrigger>
            ))}
        </TabsList>
        <TabsContent value="overview">
          <div className="stack">
            <section className="consent-box">
              <h3>
                {p.category
                  ? "Group " + p.category + " · " + groupPaths[p.category]
                  : p.pathway}
              </h3>
              <p>
                Screening supports care coordination. It is not a confirmed
                cancer diagnosis.
              </p>
            </section>
            <h3>Next steps & appointments</h3>
            {data.records
              .filter((r: any) =>
                ["referral", "followup", "counselling"].includes(r.kind),
              )
              .map((r: any) => (
                <div className="record" key={r.id}>
                  <span className="badge">{r.status}</span>
                  <h3>
                    {r.kind === "followup"
                      ? "Follow-up"
                      : r.kind === "counselling"
                        ? "Cessation support"
                        : "Doctor referral"}
                  </h3>
                  <p>
                    {r.data.date ||
                      r.data.destination ||
                      r.data.notes ||
                      "Awaiting assignment"}
                  </p>
                </div>
              ))}
            {can("ADMIN") && (
              <div className="form-grid">
                {["DOCTOR_ADMIN"].map((r) => (
                  <Field key={r} label={"Assign " + r.toLowerCase()}>
                    <Choice
                      label="Select staff"
                      value={
                        p[
                          ["DOCTOR", "DOCTOR_ADMIN"].includes(r)
                            ? "doctor_id"
                            : "counsellor_id"
                        ] || ""
                      }
                      options={users
                        .filter((u) => u.role === r && u.active)
                        .map((u) => u.id)}
                      onChange={(v) =>
                        save("assign", { data: { role: r, userId: v } }).catch(
                          () => {},
                        )
                      }
                    />
                    <small>
                      {users.length
                        ? "Choose an authorized staff account."
                        : "Add staff accounts in live administration."}
                    </small>
                  </Field>
                ))}
              </div>
            )}
            {can("ADMIN", "REGISTRATION", "DOCTOR", "PATIENT") && (
              <button
                className="secondary"
                onClick={async () => {
                  try {
                    const r = await save("qr", {});
                    setToken(r.token);
                  } catch {}
                }}
              >
                <ScanLine size={16} /> Generate / replace patient QR
              </button>
            )}
            {token && (
              <div className="qr-card">
                <QRImage value={token} />
                <p className="fine">
                  This code contains only a random token. It does not grant
                  access to the record. Replacing it invalidates the previous
                  QR.
                </p>
              </div>
            )}
          </div>
        </TabsContent>
        <TabsContent value="screening">
          <div className="stack">
            {data.answers.length > 0 && (
              <section>
                <h3>Recorded responses</h3>
                {data.answers.map((a: any, i: number) => (
                  <div className="answer" key={i}>
                    <strong>{a.question_text}</strong>
                    <p>{String(JSON.parse(a.answer))}</p>
                    <small>
                      {a.version} · {new Date(a.at).toLocaleString()}
                    </small>
                  </div>
                ))}
              </section>
            )}
            {can("ADMIN", "REGISTRATION", "DOCTOR") &&
              (currentProtocol ? (
                <Questionnaire
                  protocol={currentProtocol.definition}
                  submit={(answers) =>
                    save("screen", { protocolId: currentProtocol.id, answers })
                  }
                />
              ) : (
                <p className="notice">
                  No clinically approved questionnaire is available.
                </p>
              ))}
          </div>
        </TabsContent>
        <TabsContent value="examination">
          <div className="stack">
            {can("DOCTOR") ? (
              <Examination
                busy={busy}
                save={(d) => save("examination", { data: d })}
              />
            ) : (
              <p className="notice">
                Only an authorised doctor can record and verify an examination.
              </p>
            )}
            {data.records
              .filter((r: any) => r.kind === "assessment")
              .map((r: any) => (
                <div className="record" key={r.id}>
                  <h3>{r.status}</h3>
                  <p>{r.data.impression}</p>
                  <p>{r.data.notes}</p>
                  <small>{new Date(r.at).toLocaleString()}</small>
                </div>
              ))}
          </div>
        </TabsContent>
        <TabsContent value="care">
          <div className="stack">
            <div className="action-row">
              {[
                ["counselling", "Cessation support", ["COUNSELLOR"]],
                [
                  "referral",
                  "Doctor referral",
                  ["ADMIN", "REGISTRATION", "DOCTOR"],
                ],
                ["treatment", "Treatment decision", ["DOCTOR"]],
                ["followup", "Follow-up", ["ADMIN", "DOCTOR", "COUNSELLOR"]],
              ].map(
                ([kind, label, allow]: any) =>
                  can(...allow) && (
                    <button
                      className="secondary"
                      key={kind}
                      onClick={() => {
                        setEditRecord(null);
                        setAction(kind);
                      }}
                    >
                      <Plus size={15} />
                      {label}
                    </button>
                  ),
              )}
            </div>
            {data.records
              .filter(
                (r: any) =>
                  !["assessment", "screening"].includes(r.kind) &&
                  !r.kind.startsWith("history:"),
              )
              .map((r: any) => (
                <div className="record" key={r.id}>
                  <span className="badge">{r.status}</span>
                  <h3>{r.kind}</h3>
                  <p>{r.data.notes}</p>
                  {Object.entries(r.data)
                    .filter(([k]) => !["notes", "kind", "status"].includes(k))
                    .map(([k, v]) => (
                      <small key={k} className="block">
                        {k.replaceAll(/([A-Z])/g, " $1")}: {String(v)}
                      </small>
                    ))}
                  <small>{new Date(r.at).toLocaleString()}</small>
                  {can("ADMIN", "DOCTOR", "COUNSELLOR") && (
                    <button
                      className="text-button"
                      onClick={() => {
                        setEditRecord(r);
                        setAction(r.kind);
                      }}
                    >
                      Update this workflow
                    </button>
                  )}
                </div>
              ))}
          </div>
        </TabsContent>
        <TabsContent value="testing">
          <div className="stack">
            {can("ADMIN", "DOCTOR", "LAB") && (
              <button
                className="secondary"
                onClick={() => {
                  setEditRecord(null);
                  setAction("sample");
                }}
              >
                <Plus size={16} /> Record sample collection
              </button>
            )}
            {data.samples.length === 0 && (
              <p className="muted">No samples have been collected.</p>
            )}
            {data.samples.map((s: any) => (
              <div className="record" key={s.id}>
                <span className="badge">{s.status}</span>
                <h3>{s.type}</h3>
                <p className="patient-id">{s.id}</p>
                <small>
                  {s.location} · {new Date(s.collected_at).toLocaleString()}
                </small>
                {can("ADMIN", "LAB") && sampleStates.indexOf(s.status) < 3 && (
                  <button
                    className="text-button"
                    disabled={busy}
                    onClick={() =>
                      save("sampleStatus", {
                        sampleId: s.id,
                        status:
                          sampleStates[sampleStates.indexOf(s.status) + 1],
                        revision: s.revision,
                      }).catch(() => {})
                    }
                  >
                    Mark {sampleStates[sampleStates.indexOf(s.status) + 1]}{" "}
                    <ArrowRight size={15} />
                  </button>
                )}
                {can("ADMIN", "LAB") && s.status === "Processing" && (
                  <ReportUpload
                    sample={s}
                    patient={p}
                    mode={mode}
                    done={async () => {
                      await refresh();
                      changed();
                    }}
                  />
                )}
              </div>
            ))}
            <h3>Laboratory reports</h3>
            {data.reports.length === 0 && (
              <p className="muted">
                Verified reports will appear here when available.
              </p>
            )}
            {data.reports.map((r: any) => {
              const s = data.samples.find((s: any) => s.id === r.sample_id);
              return (
                <div className="record" key={r.id}>
                  <span className="badge">{r.status}</span>
                  <h3>
                    <FileText size={16} /> {r.filename}
                  </h3>
                  <p className="patient-id">{r.sample_id}</p>
                  {can("ADMIN", "LAB") && r.status !== "Linked" ? (
                    <ReportVerification
                      mode={mode}
                      report={r}
                      sample={s}
                      patient={p}
                      save={save}
                    />
                  ) : (
                    <button
                      className="text-button"
                      onClick={async () => {
                        try {
                          const res = await fetch(
                            "/api/report?id=" + encodeURIComponent(r.id),
                            { headers: { "x-care-mode": mode } },
                          );
                          if (!res.ok)
                            throw new Error(((await res.json()) as any).error);
                          const url = URL.createObjectURL(await res.blob());
                          const a = document.createElement("a");
                          a.href = url;
                          a.download = "verified-report.pdf";
                          a.click();
                          setTimeout(() => URL.revokeObjectURL(url), 1000);
                        } catch (e) {
                          setError((e as Error).message);
                        }
                      }}
                    >
                      Open verified report
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </TabsContent>
        <TabsContent value="consent">
          <div className="stack">
            {can("ADMIN", "REGISTRATION", "DOCTOR") && (
              <button
                className="secondary"
                onClick={() => {
                  setEditRecord(null);
                  setAction("consent");
                }}
              >
                <Plus size={16} /> Record consent / withdrawal
              </button>
            )}
            {data.consents.map((c: any) => (
              <div className="record" key={c.id}>
                <span className="badge">{c.status}</span>
                <h3>{c.type}</h3>
                <p>
                  {c.method} · version {c.version}
                </p>
                <small>
                  {new Date(c.at).toLocaleString()} · {c.actor}
                </small>
              </div>
            ))}
          </div>
        </TabsContent>
        <TabsContent value="timeline">
          <div className="timeline">
            {data.timeline.map((e: any, i: number) => (
              <div key={i}>
                <Clock size={16} />
                <section>
                  <h3>{e.action}</h3>
                  <p>{new Date(e.at).toLocaleString()}</p>
                  <small>Actor: {e.actor}</small>
                </section>
              </div>
            ))}
          </div>
        </TabsContent>
      </Tabs>
      <Modal
        open={!!action}
        close={() => setAction("")}
        title={
          action === "sample"
            ? "Sample collection"
            : action === "consent"
              ? "Consent record"
              : action === "treatment"
                ? "Clinical treatment decision"
                : action === "counselling"
                  ? "Cessation support"
                  : "Record " + action
        }
        description="Changes are recorded in the participant timeline and audit history."
      >
        <ActionForm
          initial={editRecord}
          kind={action}
          busy={busy}
          users={users}
          doctor={can("DOCTOR")}
          save={(d) =>
            save(
              action === "sample"
                ? "sample"
                : action === "consent"
                  ? "consent"
                  : "record",
              { data: d, recordId: editRecord?.id },
            )
          }
        />
      </Modal>
    </div>
  );
}
function Examination({
  save,
  busy,
}: {
  save: (d: any) => Promise<any>;
  busy: boolean;
}) {
  const [d, setD] = useState<any>({
      completed: true,
      habit: null,
      lesion: null,
      verified: false,
      mouthOpening: null,
      distance: "",
      findings: [],
      site: [],
      impression: "",
      notes: "",
      recommendedTests: "",
      referral: "No",
      destination: "Not applicable",
      followupRequired: false,
      followupDate: "",
    }),
    [error, setError] = useState(""),
    [success, setSuccess] = useState("");
  const set = (k: string, v: any) => setD({ ...d, [k]: v });
  return (
    <form
      className="stack"
      onSubmit={async (e) => {
        e.preventDefault();
        setError("");
        try {
          const r = await save({
            ...d,
            distance: d.distance === "" ? null : Number(d.distance),
            followupDate: d.followupDate || null,
          });
          setSuccess(
            r.group
              ? "Verified: Group " + r.group + " · " + r.pathway
              : "Examination status recorded",
          );
        } catch (e) {
          setError((e as Error).message);
        }
      }}
    >
      <h3>Clinician-only oral examination</h3>
      <p className="notice">
        The clinician determines lesion presence and urgency. Symptoms alone do
        not assign a group.
      </p>
      <Choice
        label="Examination completed"
        value={d.completed ? "Completed" : "Unable or refused"}
        options={["Completed", "Unable or refused"]}
        onChange={(v) => set("completed", v === "Completed")}
      />
      {d.completed && (
        <>
          <div className="form-grid">
            <Field label="Current habit — clinician verified">
              <Choice
                label="Habit status"
                value={d.habit === null ? "" : d.habit ? "Present" : "Absent"}
                options={["Present", "Absent"]}
                onChange={(v) => set("habit", v === "Present")}
              />
            </Field>
            <Field label="Lesion — clinician determined">
              <Choice
                label="Lesion status"
                value={d.lesion === null ? "" : d.lesion ? "Present" : "Absent"}
                options={["Present", "Absent"]}
                onChange={(v) => set("lesion", v === "Present")}
              />
            </Field>
            <Field label="Mouth opening">
              <Choice
                label="Mouth opening"
                value={d.mouthOpening || ""}
                options={["Normal", "Restricted"]}
                onChange={(v) => set("mouthOpening", v)}
              />
            </Field>
            <Field label="Inter-incisor distance, if indicated (mm)">
              <input
                type="number"
                min="0"
                max="100"
                value={d.distance}
                onChange={(e) => set("distance", e.target.value)}
              />
            </Field>
          </div>
          <fieldset className="question">
            <legend>Oral findings</legend>
            <div className="check-grid">
              {findings.map((v) => (
                <Check
                  key={v}
                  checked={d.findings.includes(v)}
                  onChange={(b) =>
                    set(
                      "findings",
                      b
                        ? v === "No abnormality"
                          ? [v]
                          : [
                              ...d.findings.filter(
                                (x: string) => x !== "No abnormality",
                              ),
                              v,
                            ]
                        : d.findings.filter((x: string) => x !== v),
                    )
                  }
                >
                  {v}
                </Check>
              ))}
            </div>
          </fieldset>
          <fieldset className="question">
            <legend>Site</legend>
            <div className="check-grid">
              {sites.map((v) => (
                <Check
                  key={v}
                  checked={d.site.includes(v)}
                  onChange={(b) =>
                    set(
                      "site",
                      b
                        ? v === "N/A"
                          ? [v]
                          : [...d.site.filter((x: string) => x !== "N/A"), v]
                        : d.site.filter((x: string) => x !== v),
                    )
                  }
                >
                  {v}
                </Check>
              ))}
            </div>
          </fieldset>
          <Field label="Clinical impression">
            <Choice
              value={d.impression}
              label="Clinical impression"
              options={impressions}
              onChange={(v) => set("impression", v)}
            />
          </Field>
          <div className="form-grid">
            <Field label="Referral required">
              <Choice
                value={d.referral}
                label="Referral required"
                options={["No", "Planned-routine", "Priority"]}
                onChange={(v) => set("referral", v)}
              />
            </Field>
            <Field label="Referral destination">
              <Choice
                value={d.destination}
                label="Referral destination"
                options={[
                  "Not applicable",
                  "Government hospital",
                  "HAOC-associated specialist pathway",
                  "Participant’s preferred hospital or doctor",
                  "Other",
                ]}
                onChange={(v) => set("destination", v)}
              />
            </Field>
          </div>
          <Check
            checked={d.followupRequired}
            onChange={(v) => set("followupRequired", v)}
          >
            Follow-up required
          </Check>
          {d.followupRequired && (
            <Field label="Clinician-selected follow-up date (optional)">
              <input
                type="date"
                value={d.followupDate}
                onChange={(e) => set("followupDate", e.target.value)}
              />
              <small>No interval is automatically prescribed.</small>
            </Field>
          )}
        </>
      )}
      <Field label="Recommended tests, if clinically indicated">
        <textarea
          value={d.recommendedTests}
          maxLength={2000}
          onChange={(e) => set("recommendedTests", e.target.value)}
        />
      </Field>
      <Field label="Clinical observations / recommendations">
        <textarea
          value={d.notes}
          maxLength={8000}
          onChange={(e) => set("notes", e.target.value)}
        />
      </Field>
      <Check checked={d.verified} onChange={(v) => set("verified", v)}>
        I am the examining clinician and verify these findings and the resulting
        management group.
      </Check>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {success && (
        <p className="notice" role="status">
          {success}
        </p>
      )}
      <button className="primary" disabled={busy || !d.verified}>
        Verify examination & record pathway
      </button>
    </form>
  );
}
function ActionForm({
  kind,
  save,
  busy,
  users,
  doctor,
  initial,
}: {
  initial?: any;
  kind: string;
  save: (d: any) => Promise<any>;
  busy: boolean;
  users: any[];
  doctor: boolean;
}) {
  const statuses: Record<string, string[]> = {
    counselling: [
      "Pending",
      "Assigned",
      "In progress",
      "Completed",
      "Follow-up required",
    ],
    referral: [
      "Pending",
      "Assigned",
      "Seen",
      "Further evaluation",
      "Treatment discussion",
      "Follow-up",
    ],
    treatment: ["Discussed", "Approved", "In progress", "Completed"],
    followup: ["Pending", "Scheduled", "Completed", "Missed"],
  };
  const [d, setD] = useState<any>({
      kind,
      notes: "",
      status: statuses[kind]?.[0] || "granted",
      type: kind === "sample" ? "Oral sample" : "testing",
      location: "",
      labId: "",
      method: "Written",
      confirmed: false,
      date: "",
      priority: "Routine",
      supportOffered: false,
      contactStatus: "Contacted",
      referralOutcome: "Pending",
      cessationOutcome: "Unknown",
      clinicalOutcome: "Unknown",
      ...(initial?.data || {}),
      ...(initial ? { status: initial.status } : {}),
    }),
    [error, setError] = useState("");
  const set = (k: string, v: any) => setD({ ...d, [k]: v });
  return (
    <form
      className="stack"
      onSubmit={async (e) => {
        e.preventDefault();
        setError("");
        try {
          let result: any =
            kind === "sample"
              ? { type: d.type, location: d.location, labId: d.labId || null }
              : kind === "consent"
                ? {
                    type: d.type,
                    status: d.status,
                    method: d.method,
                    confirmed: d.confirmed,
                  }
                : {
                    kind,
                    notes: d.notes,
                    status: d.status,
                    ...(kind === "followup"
                      ? {
                          date: d.date,
                          contactStatus: d.contactStatus,
                          referralOutcome: d.referralOutcome,
                          cessationOutcome: d.cessationOutcome,
                          ...(doctor
                            ? { clinicalOutcome: d.clinicalOutcome }
                            : {}),
                        }
                      : {}),
                    ...(kind === "counselling"
                      ? {
                          supportOffered: d.supportOffered,
                          cessationOutcome: d.cessationOutcome,
                        }
                      : {}),
                    ...(kind === "referral" ? { priority: d.priority } : {}),
                  };
          await save(result);
        } catch (e) {
          setError((e as Error).message);
        }
      }}
    >
      {kind === "sample" ? (
        <>
          <Field label="Sample type">
            <Choice
              label="Sample type"
              value={d.type}
              options={["Oral sample", "Blood sample", "Other"]}
              onChange={(v) => set("type", v)}
            />
          </Field>
          <Field label="Collection location">
            <input
              required
              value={d.location}
              onChange={(e) => set("location", e.target.value)}
            />
          </Field>
          <Field label="Assigned laboratory staff">
            <Choice
              label="Lab staff"
              value={d.labId}
              options={users
                .filter(
                  (u) =>
                    ["DOCTOR_ADMIN", "SUPER_ADMIN", "LAB"].includes(u.role) &&
                    u.active,
                )
                .map((u) => u.id)}
              onChange={(v) => set("labId", v)}
            />
          </Field>
          <p className="fine">
            Requires a doctor assessment and separate testing consent.
          </p>
        </>
      ) : kind === "consent" ? (
        <>
          <Choice
            label="Consent type"
            value={d.type}
            options={["registration", "screening", "testing", "treatment"]}
            onChange={(v) => set("type", v)}
          />
          <Choice
            label="Consent status"
            value={d.status}
            options={["granted", "withdrawn"]}
            onChange={(v) => set("status", v)}
          />
          <Choice
            label="Recorded method"
            value={d.method}
            options={["Written", "Verbal witnessed", "Patient checkbox"]}
            onChange={(v) => set("method", v)}
          />
          <Check checked={d.confirmed} onChange={(v) => set("confirmed", v)}>
            I confirm that the participant gave or withdrew this specific
            consent after an explanation.
          </Check>
        </>
      ) : (
        <>
          <Field label="Status">
            <Choice
              label="Status"
              value={d.status}
              options={statuses[kind] || []}
              onChange={(v) => set("status", v)}
            />
          </Field>
          {kind === "treatment" && (
            <p className="notice">
              Approval requires a doctor assessment, a clinical decision below,
              and separate treatment consent.
            </p>
          )}
          {kind === "followup" && (
            <>
              <Field label="Contact / appointment date">
                <input
                  required
                  type="date"
                  value={d.date}
                  onChange={(e) => set("date", e.target.value)}
                />
              </Field>
              <Choice
                label="Contact status"
                value={d.contactStatus}
                options={["Contacted", "No answer", "Wrong/unavailable number"]}
                onChange={(v) => set("contactStatus", v)}
              />
              <Choice
                label="Referral outcome"
                value={d.referralOutcome}
                options={[
                  "Appointment planned",
                  "Attended",
                  "Did not attend",
                  "Declined",
                  "Unable to contact",
                  "Pending",
                ]}
                onChange={(v) => set("referralOutcome", v)}
              />
              {doctor && (
                <Choice
                  label="Clinical outcome, if known"
                  value={d.clinicalOutcome}
                  options={[
                    "No significant lesion",
                    "Benign lesion",
                    "Potentially malignant disorder",
                    "Biopsy advised/performed",
                    "Malignancy confirmed",
                    "Other",
                    "Unknown",
                  ]}
                  onChange={(v) => set("clinicalOutcome", v)}
                />
              )}
            </>
          )}
          {["followup", "counselling"].includes(kind) && (
            <Choice
              label="Cessation outcome"
              value={d.cessationOutcome}
              options={[
                "Interested/referred",
                "Not interested",
                "Not applicable",
                "Unknown",
              ]}
              onChange={(v) => set("cessationOutcome", v)}
            />
          )}
          {kind === "counselling" && (
            <Check
              checked={d.supportOffered}
              onChange={(v) => set("supportOffered", v)}
            >
              Cessation support offered / referred
            </Check>
          )}
          {kind === "referral" && (
            <Choice
              label="Priority"
              value={d.priority}
              options={["Routine", "Priority", "Urgent"]}
              onChange={(v) => set("priority", v)}
            />
          )}
          <Field
            label={
              kind === "treatment" ? "Clinical decision & rationale" : "Notes"
            }
          >
            <textarea
              required
              minLength={kind === "treatment" ? 10 : 3}
              maxLength={8000}
              value={d.notes}
              onChange={(e) => set("notes", e.target.value)}
            />
          </Field>
        </>
      )}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <button
        className="primary"
        disabled={busy || (kind === "consent" && !d.confirmed)}
      >
        Save record
      </button>
    </form>
  );
}
function ReportUpload({ sample, patient, mode, done }: any) {
  const [file, setFile] = useState<File | null>(null),
    [confirmed, setConfirmed] = useState(false),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  return (
    <form
      className="stack report-box"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        try {
          const form = new FormData();
          form.set("patientId", patient.id);
          form.set("patientName", patient.name);
          form.set("sampleId", sample.id);
          form.set("sampleType", sample.type);
          form.set("confirm", String(confirmed));
          if (file) form.set("file", file);
          const r = await fetch("/api/report", {
            method: "POST",
            headers: { "x-care-mode": mode },
            body: form,
          });
          const j: any = await r.json();
          if (!r.ok) throw new Error(j.error);
          await done();
        } catch (e) {
          setError((e as Error).message);
        } finally {
          setBusy(false);
        }
      }}
    >
      <p>
        <strong>{patient.name}</strong>
        <br />
        {patient.id}
        <br />
        {sample.id} · {sample.type}
      </p>
      <Field label="Laboratory PDF · maximum 5 MB">
        <input
          type="file"
          accept="application/pdf"
          required
          onChange={(e) => setFile(e.target.files?.[0] || null)}
        />
      </Field>
      <Check checked={confirmed} onChange={setConfirmed}>
        I matched the patient name, participant ID, sample ID and sample type to
        this report.
      </Check>
      {error && <p className="error">{error}</p>}
      <button className="primary" disabled={!confirmed || !file || busy}>
        Upload for verification
      </button>
    </form>
  );
}
function ReportVerification({ report, sample, patient, save, mode }: any) {
  const [confirm, setConfirm] = useState(false);
  return (
    <div className="stack report-box">
      <button
        className="text-button"
        onClick={async () => {
          const r = await fetch(
            "/api/report?id=" + encodeURIComponent(report.id),
            { headers: { "x-care-mode": mode } },
          );
          if (!r.ok) return;
          const url = URL.createObjectURL(await r.blob());
          const a = document.createElement("a");
          a.href = url;
          a.download = "report-for-verification.pdf";
          a.click();
          setTimeout(() => URL.revokeObjectURL(url), 1000);
        }}
      >
        Download report for verification
      </button>
      <p>
        {patient.name}
        <br />
        <span className="patient-id">
          {patient.id}
          <br />
          {sample?.id}
        </span>
        <br />
        {sample?.type}
      </p>
      <Check checked={confirm} onChange={setConfirm}>
        I confirm these patient and sample details match the report.
      </Check>
      <button
        className="secondary"
        disabled={!confirm}
        onClick={() =>
          save(report.status === "Uploaded" ? "verifyReport" : "linkReport", {
            reportId: report.id,
            sampleId: sample.id,
            sampleType: sample.type,
            patientName: patient.name,
            confirm: true,
          }).catch(() => {})
        }
      >
        {report.status === "Uploaded"
          ? "Verify report"
          : "Link verified report to participant"}
      </button>
    </div>
  );
}
