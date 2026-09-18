"use client";
import { useState, useEffect, useCallback } from "react";
import {
  Activity,
  LayoutDashboard,
  Users,
  ClipboardList,
  HeartHandshake,
  Stethoscope,
  FlaskConical,
  FileCheck2,
  CalendarDays,
  Settings2,
  ShieldCheck,
  ArrowUpRight,
  Plus,
  ArrowRight,
  MapPin,
  Search,
  ScanLine,
  Download,
  SlidersHorizontal,
  RotateCcw,
} from "lucide-react";
import {
  SidebarProvider,
  Sidebar,
  SidebarHeader,
  SidebarContent,
  SidebarFooter,
  SidebarTrigger,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
} from "@/components/ui/sidebar";
import {
  Table,
  TableHeader,
  TableHead,
  TableBody,
  TableRow,
  TableCell,
} from "@/components/ui/table";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { Modal, Choice, Field, Check, Scanner, api, QRImage } from "./care-ui";
import { Registration, Questionnaire } from "./intake";
import PatientProfile from "./patient-profile";
import { groupPaths, pilot } from "@/lib/domain";
const nav = [
  ["Overview", LayoutDashboard],
  ["Participants", Users],
  ["Screening", ClipboardList],
  ["Cessation support", HeartHandshake],
  ["Doctor referrals", Stethoscope],
  ["Samples & lab", FlaskConical],
  ["Reports", FileCheck2],
  ["Follow-ups", CalendarDays],
  ["Camps", MapPin],
  ["Protocol & settings", Settings2],
  ["Audit log", ShieldCheck],
] as const;
const empty = {
  patients: [],
  camps: [],
  protocols: [],
  records: [],
  samples: [],
  audit: [],
  users: [],
  actor: { name: "Care team", role: "ADMIN", demo: true },
};
export default function Workspace() {
  const [view, setView] = useState("Overview"),
    [data, setData] = useState<any>(empty),
    [mode, setMode] = useState("demo"),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(true),
    [search, setSearch] = useState(""),
    [camp, setCamp] = useState("All camps"),
    [group, setGroup] = useState("All groups"),
    [date, setDate] = useState(""),
    [location, setLocation] = useState("All locations"),
    [status, setStatus] = useState("All statuses"),
    [modal, setModal] = useState(""),
    [selected, setSelected] = useState(""),
    [newId, setNewId] = useState(""),
    [entryUrl, setEntryUrl] = useState("");
  const reload = useCallback(async () => {
    try {
      setData(await api(undefined, undefined, mode));
      setError("");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [mode]);
  useEffect(() => {
    setLoading(true);
    setData(empty);
    async function init() {
      try {
        if (mode === "demo") await api("seed", {}, mode);
        await api("sessionStart", {}, mode);
        await reload();
      } catch (e) {
        setError((e as Error).message);
        setLoading(false);
      }
    }
    void init();
    setEntryUrl(window.location.origin + "/register");
  }, [mode, reload]);
  useEffect(() => {
    const context = (document as any).modelContext;
    if (!context?.registerTool) return;
    const life = new AbortController();
    Promise.resolve(
      context.registerTool(
        {
          name: "navigate_care_workspace",
          title: "Open a care workspace section",
          description:
            "Navigate to a section. This does not view or return patient records.",
          inputSchema: {
            type: "object",
            properties: {
              section: { type: "string", enum: nav.map((n) => n[0]) },
            },
            required: ["section"],
            additionalProperties: false,
          },
          annotations: { readOnlyHint: true },
          execute: (v: any) => {
            if (!v || !nav.some((n) => n[0] === v.section))
              throw new Error("Unknown section");
            setView(v.section);
            return { section: v.section };
          },
        },
        { signal: life.signal },
      ),
    ).catch(() => {});
    return () => life.abort();
  }, []);
  const demo = mode === "demo",
    role = data.actor.role,
    can = (...r: string[]) => demo || r.includes(role);
  const filtered = data.patients.filter((p: any) => {
    const c = data.camps.find((c: any) => c.id === p.camp_id);
    return (
      [
        p.name,
        p.id,
        p.phone,
        ...data.samples
          .filter((s: any) => s.patient_id === p.id)
          .map((s: any) => s.id),
      ].some((x) =>
        String(x || "")
          .toLowerCase()
          .includes(search.toLowerCase()),
      ) &&
      (camp === "All camps" || c?.name === camp) &&
      (location === "All locations" || c?.location === location) &&
      (group === "All groups" ||
        (group === "Unclassified"
          ? !p.category
          : p.category === group.slice(-1))) &&
      (!date || p.created_at.slice(0, 10) === date) &&
      (status === "All statuses" || p.pathway === status)
    );
  });
  const ids = new Set(filtered.map((p: any) => p.id));
  const relevant = data.records.filter((r: any) => ids.has(r.patient_id));
  const followups = relevant.filter(
    (r: any) => r.kind === "followup" && r.status !== "Completed",
  );
  const counts = ["1", "2", "3", "4"].map(
    (g) => filtered.filter((p: any) => p.category === g).length,
  );
  const screened = filtered.filter((p: any) => p.category).length;
  const header = view === "Overview" ? "Care starts with connection." : view;
  const protocol =
    data.protocols.find((p: any) => p.status === "Approved") ||
    (demo ? data.protocols[0] : null);
  function records(kind: string) {
    return relevant.filter((r: any) => r.kind === kind);
  }
  function open(id: string) {
    setSelected(id);
  }
  async function downloadAnalysis() {
    try {
      const r = await fetch("/api/analysis", {
        headers: { "x-care-mode": mode },
      });
      const j: any = await r.json();
      if (!r.ok) throw new Error(j.error);
      const blob = new Blob([JSON.stringify(j.records, null, 2)], {
        type: "application/json",
      });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = "drive-safe-deidentified-analysis.json";
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    } catch (e) {
      setError((e as Error).message);
    }
  }
  return (
    <SidebarProvider>
      <Sidebar className="care-sidebar">
        <SidebarHeader>
          <a className="brand" href="/campaign">
            <span className="brand-mark">
              <Activity />
            </span>
            <span>
              HYDERABAD<span>AGAINST ORAL CANCER</span>
            </span>
          </a>
          <div className="program-tag">
            DRIVE SAFE <span>PILOT</span>
          </div>
          <div className="workspace-label">CARE COORDINATION</div>
        </SidebarHeader>
        <SidebarContent>
          <SidebarMenu>
            {nav
              .filter(
                ([t]) =>
                  can("ADMIN") ||
                  (role === "DOCTOR" && t === "Protocol & settings") ||
                  (!["Camps", "Protocol & settings", "Audit log"].includes(t) &&
                    ((role !== "LAB" && role !== "PATIENT") ||
                      [
                        "Overview",
                        "Participants",
                        "Samples & lab",
                        "Reports",
                        "Follow-ups",
                      ].includes(t))),
              )
              .map(([title, Icon]) => (
                <SidebarMenuItem key={title}>
                  <SidebarMenuButton
                    isActive={view === title}
                    onClick={() => setView(title)}
                  >
                    <Icon />
                    <span>{title}</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
          </SidebarMenu>
        </SidebarContent>
        <SidebarFooter>
          <a className="campaign-link" href="/campaign">
            Visit campaign page <ArrowUpRight size={16} />
          </a>
          <div className="staff">
            <span className="avatar">
              {demo ? "DC" : data.actor.name.slice(0, 2).toUpperCase()}
            </span>
            <div>
              {demo ? "Demo care team" : data.actor.name}
              <small>
                {demo ? "Demonstration workspace" : role.toLowerCase()}
              </small>
            </div>
          </div>
          <button
            className="text-button"
            onClick={async () => {
              try {
                await api("sessionEnd", {}, mode);
              } finally {
                window.location.assign(
                  "/signout-with-chatgpt?return_to=/campaign",
                );
              }
            }}
          >
            Sign out
          </button>
        </SidebarFooter>
      </Sidebar>
      <div className="workspace">
        <header className="topbar">
          <div className="flex items-center gap-3">
            <SidebarTrigger />
            <span>
              DRIVE SAFE <span className="slash">/</span> {view}
            </span>
          </div>
          <div className="action-row">
            <button
              className="icon-button"
              title="Scan participant QR"
              aria-label="Scan participant QR"
              onClick={() => setModal("scan")}
            >
              <ScanLine size={20} />
            </button>
            <Choice
              label="Workspace mode"
              value={demo ? "Demonstration" : "Live workspace"}
              options={["Demonstration", "Live workspace"]}
              onChange={(v) => {
                setMode(v === "Demonstration" ? "demo" : "live");
                setSelected("");
              }}
            />
          </div>
        </header>
        <main className="main-content">
          <div className="page-heading">
            <div>
              <p className="eyebrow">
                HYDERABAD AGAINST ORAL CANCER · DRIVE SAFE
              </p>
              <h1>{header}</h1>
              <p>
                {view === "Overview"
                  ? "A clear view of your screening program and every next step."
                  : "Connected records. Clear responsibilities. Continuous care."}
              </p>
            </div>
            {can("ADMIN", "REGISTRATION") && (
              <button
                className="primary"
                disabled={!!error || loading}
                onClick={() => {
                  setNewId("");
                  setModal("register");
                }}
              >
                <Plus size={18} /> Register participant
              </button>
            )}
          </div>
          <div className="notice">
            <ShieldCheck size={18} />
            <span>
              {demo
                ? "Demonstration · Synthetic records only. Provisional pilot workflow; live intake is locked until governance review."
                : "Authorized workspace · Access is limited to your role and assigned participants."}
            </span>
          </div>
          {error && (
            <section className="error-panel" role="alert">
              <h2>Workspace unavailable</h2>
              <p>{error}</p>
              <div className="action-row">
                <a
                  className="primary"
                  href="/signin-with-chatgpt?return_to=/"
                  target="_top"
                >
                  Sign in
                </a>
                <button className="secondary" onClick={reload}>
                  Try again
                </button>
              </div>
            </section>
          )}
          {!error && (
            <>
              <div className="filters">
                <div className="search-box">
                  <Search size={17} />
                  <input
                    aria-label="Search participants"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Search name, participant ID, mobile or sample ID"
                  />
                </div>
                <Choice
                  label="Camp"
                  value={camp}
                  options={[
                    "All camps",
                    ...new Set<string>(data.camps.map((c: any) => c.name)),
                  ]}
                  onChange={setCamp}
                />
                <Choice
                  label="Group"
                  value={group}
                  options={[
                    "All groups",
                    "Group 1",
                    "Group 2",
                    "Group 3",
                    "Group 4",
                    "Unclassified",
                  ]}
                  onChange={setGroup}
                />
                <button
                  className="icon-button"
                  onClick={() => setModal("filters")}
                  aria-label="More filters"
                >
                  <SlidersHorizontal size={18} />
                </button>
              </div>
              {loading ? (
                <div className="panel loading">
                  Loading your care workspace…
                </div>
              ) : view === "Overview" ? (
                <>
                  <div className="section-line">
                    <h2>Campaign overview</h2>
                    <span>
                      {camp} ·{" "}
                      {new Date().toLocaleDateString("en-IN", {
                        month: "long",
                        year: "numeric",
                      })}
                    </span>
                  </div>
                  <div className="metrics">
                    {[
                      [
                        "Participants",
                        filtered.length,
                        "Registered for DRIVE SAFE",
                        Users,
                      ],
                      [
                        "Examinations verified",
                        screened,
                        filtered.length - screened + " awaiting classification",
                        ClipboardList,
                      ],
                      [
                        "Doctor referrals",
                        records("referral").length,
                        "Coordinated clinical care",
                        Stethoscope,
                      ],
                      [
                        "Follow-ups pending",
                        followups.length,
                        "Continue the care journey",
                        CalendarDays,
                      ],
                    ].map(([label, value, note, Icon]: any) => (
                      <article className="metric" key={label}>
                        <div>
                          {label}
                          <Icon size={18} />
                        </div>
                        <strong>{value}</strong>
                        <small>{note}</small>
                      </article>
                    ))}
                  </div>
                  <div className="overview-grid">
                    <section className="panel">
                      <div className="panel-heading">
                        <h2>Every screening. A next step.</h2>
                        <span className="badge">4-group framework</span>
                      </div>
                      <p className="muted">
                        Habit status + clinician-determined lesion status.
                      </p>
                      <div className="pathways">
                        {[
                          [
                            "No habit · no lesion",
                            "Education; no scheduled programme follow-up",
                          ],
                          [
                            "No habit · lesion",
                            "Clinical lesion evaluation pathway",
                          ],
                          [
                            "Habit · no lesion",
                            "Cessation and planned re-screening",
                          ],
                          [
                            "Habit · lesion",
                            "Lesion evaluation and cessation support",
                          ],
                        ].map(([label, detail], i) => (
                          <button
                            className="pathway pathway-button"
                            key={label}
                            onClick={() => {
                              setGroup("Group " + (i + 1));
                              setView("Participants");
                            }}
                          >
                            <span className="path-number">0{i + 1}</span>
                            <div>
                              <h3>{label}</h3>
                              <small>{detail}</small>
                            </div>
                            <strong>{counts[i]}</strong>
                          </button>
                        ))}
                      </div>
                      <div className="panel-foot">
                        Groups guide management. They are not a cancer
                        diagnosis.
                        <ShieldCheck size={16} />
                      </div>
                    </section>
                    <section className="priority-card">
                      <div className="eyebrow">KEEP CARE MOVING</div>
                      <h2>
                        A little follow-up.
                        <br />A meaningful next step.
                      </h2>
                      <p>
                        Bring the right people to the right care, at the right
                        time.
                      </p>
                      <button onClick={() => setView("Follow-ups")}>
                        Review follow-ups <ArrowRight size={18} />
                      </button>
                      <div className="priority-stat">
                        <strong>
                          {followups.length.toString().padStart(2, "0")}
                        </strong>
                        <span>
                          participants awaiting
                          <br />
                          their next conversation
                        </span>
                      </div>
                      <p className="priority-bottom">
                        Follow-up dates are selected by the clinical team.
                      </p>
                    </section>
                  </div>
                  <ParticipantTable
                    patients={filtered.slice(0, 5)}
                    camps={data.camps}
                    open={open}
                    title="Recent participants"
                    more={() => setView("Participants")}
                  />
                  <div className="secondary-metrics">
                    {[
                      [
                        "Today’s registrations",
                        filtered.filter(
                          (p: any) =>
                            p.created_at.slice(0, 10) ===
                            new Date().toISOString().slice(0, 10),
                        ).length,
                      ],
                      [
                        "Cessation pending",
                        records("counselling").filter(
                          (r: any) => r.status !== "Completed",
                        ).length,
                      ],
                      [
                        "Samples collected",
                        data.samples.filter((s: any) => ids.has(s.patient_id))
                          .length,
                      ],
                      [
                        "Reports ready",
                        data.samples.filter(
                          (s: any) =>
                            ids.has(s.patient_id) &&
                            s.status === "Report linked",
                        ).length,
                      ],
                    ].map(([label, n]) => (
                      <div key={label}>
                        <strong>{n}</strong>
                        <span>{label}</span>
                      </div>
                    ))}
                  </div>
                </>
              ) : view === "Participants" || view === "Screening" ? (
                <ParticipantTable
                  patients={
                    view === "Screening"
                      ? filtered.filter((p: any) => !p.category)
                      : filtered
                  }
                  camps={data.camps}
                  open={open}
                  title={
                    view === "Screening"
                      ? "Awaiting examination & classification"
                      : "Participant directory"
                  }
                />
              ) : [
                  "Cessation support",
                  "Doctor referrals",
                  "Follow-ups",
                ].includes(view) ? (
                <section className="panel">
                  <div className="panel-heading">
                    <h2>
                      {view === "Cessation support"
                        ? "Cessation intervention queue"
                        : view === "Doctor referrals"
                          ? "Referral queue"
                          : "Continuing the care journey"}
                    </h2>
                    <span className="badge">Assigned care</span>
                  </div>
                  {records(
                    view === "Cessation support"
                      ? "counselling"
                      : view === "Doctor referrals"
                        ? "referral"
                        : "followup",
                  ).length === 0 ? (
                    <Empty text="No records match these filters." />
                  ) : (
                    records(
                      view === "Cessation support"
                        ? "counselling"
                        : view === "Doctor referrals"
                          ? "referral"
                          : "followup",
                    ).map((r: any) => (
                      <button
                        className="queue-row"
                        key={r.id}
                        onClick={() => open(r.patient_id)}
                      >
                        <span className="avatar">
                          {view === "Follow-ups" ? (
                            <CalendarDays size={17} />
                          ) : (
                            <Users size={17} />
                          )}
                        </span>
                        <div>
                          <h3>
                            {
                              data.patients.find(
                                (p: any) => p.id === r.patient_id,
                              )?.name
                            }
                          </h3>
                          <p>
                            {r.data.date ||
                              r.data.destination ||
                              r.data.notes ||
                              "Pending care assignment"}
                          </p>
                        </div>
                        <span className="badge">{r.status}</span>
                        <ArrowRight size={16} />
                      </button>
                    ))
                  )}
                </section>
              ) : ["Samples & lab", "Reports"].includes(view) ? (
                <section className="panel">
                  <div className="panel-heading">
                    <h2>
                      {view === "Reports"
                        ? "Laboratory report tracking"
                        : "Sample lifecycle"}
                    </h2>
                    <span className="badge">Verified linking required</span>
                  </div>
                  <p className="muted">
                    Collected → Sent to lab → Received → Processing → Report
                    generated → Verified → Linked
                  </p>
                  {data.samples.filter((s: any) => ids.has(s.patient_id))
                    .length === 0 ? (
                    <Empty text="No samples match these filters. Open a participant record to collect a sample." />
                  ) : (
                    data.samples
                      .filter((s: any) => ids.has(s.patient_id))
                      .map((s: any) => (
                        <button
                          className="queue-row"
                          key={s.id}
                          onClick={() => open(s.patient_id)}
                        >
                          <FlaskConical size={22} />
                          <div>
                            <h3>
                              {
                                data.patients.find(
                                  (p: any) => p.id === s.patient_id,
                                )?.name
                              }
                            </h3>
                            <p className="patient-id">{s.id}</p>
                            <small>{s.type}</small>
                          </div>
                          <span className="badge">{s.status}</span>
                          <ArrowRight size={16} />
                        </button>
                      ))
                  )}
                </section>
              ) : view === "Camps" ? (
                <>
                  <div className="section-line">
                    <h2>Screening events</h2>
                    <button
                      className="secondary"
                      onClick={() => setModal("camp")}
                    >
                      <Plus size={16} /> Add camp
                    </button>
                  </div>
                  <div className="camp-grid">
                    {data.camps.map((c: any) => (
                      <section className="panel" key={c.id}>
                        <MapPin size={25} />
                        <h2>{c.name}</h2>
                        <p>{c.location}</p>
                        <p className="muted">{c.date}</p>
                        <div className="panel-foot">
                          <span>
                            {
                              data.patients.filter(
                                (p: any) => p.camp_id === c.id,
                              ).length
                            }{" "}
                            participants
                          </span>
                          <button
                            className="text-button"
                            onClick={() => {
                              setCamp(c.name);
                              setView("Participants");
                            }}
                          >
                            View participants <ArrowRight size={15} />
                          </button>
                        </div>
                      </section>
                    ))}
                  </div>
                  <section className="panel public-qr">
                    <div>
                      <h2>One programme. One entry point.</h2>
                      <p>
                        Registration, consent and the brief participant
                        questionnaire.
                      </p>
                      <p className="muted">
                        Clinician fields and prior submissions are never
                        accessible from this QR.
                      </p>
                      <a className="text-button" href="/register">
                        Open participant entry <ArrowUpRight size={16} />
                      </a>
                    </div>
                    {entryUrl && <QRImage value={entryUrl} />}
                  </section>
                </>
              ) : view === "Protocol & settings" ? (
                <Settings
                  data={data}
                  mode={mode}
                  reload={reload}
                  exportAnalysis={downloadAnalysis}
                />
              ) : view === "Audit log" ? (
                <section className="panel">
                  <div className="panel-heading">
                    <h2>Accountability, at every step.</h2>
                    <span className="badge">Append-only events</span>
                  </div>
                  <p className="muted">
                    Authorized administrator view · Most recent 200 events
                  </p>
                  <div className="timeline">
                    {data.audit.map((e: any) => (
                      <div key={e.id}>
                        <ShieldCheck size={17} />
                        <section>
                          <h3>{e.action}</h3>
                          <p>{new Date(e.at).toLocaleString()}</p>
                          <small className="patient-id">
                            {e.patient_id || "Programme event"} · Actor{" "}
                            {e.actor}
                          </small>
                        </section>
                      </div>
                    ))}
                  </div>
                </section>
              ) : null}
            </>
          )}
        </main>
        <footer>
          Consent-led screening. Clinician-led care.
          <span>DRIVE SAFE · HAOC</span>
        </footer>
      </div>
      <Sheet open={!!selected} onOpenChange={(v) => !v && setSelected("")}>
        <SheetContent className="patient-sheet">
          <SheetHeader>
            <SheetTitle>Participant record</SheetTitle>
            <SheetDescription>
              {demo
                ? "Synthetic demonstration record"
                : "Authorized care record"}{" "}
              · DRIVE SAFE
            </SheetDescription>
          </SheetHeader>
          <div className="sheet-body">
            {selected && (
              <PatientProfile
                id={selected}
                mode={mode}
                protocols={data.protocols}
                users={data.users}
                role={role}
                demo={demo}
                changed={reload}
              />
            )}
          </div>
        </SheetContent>
      </Sheet>
      <Modal
        open={!!modal}
        close={() => setModal("")}
        title={
          modal === "register"
            ? newId
              ? "Oral health screening"
              : "Register for DRIVE SAFE"
            : modal === "scan"
              ? "Scan participant QR"
              : modal === "camp"
                ? "Create screening camp"
                : "Filter campaign records"
        }
        description={
          modal === "register"
            ? "A short, consent-led registration for the screening programme."
            : modal === "scan"
              ? "Sign-in and role authorization are required to retrieve any record."
              : "Choose the details for this workspace."
        }
      >
        {modal === "register" ? (
          newId ? (
            <div className="stack">
              <p className="notice">
                Registration saved. Your permanent ID:{" "}
                <span className="patient-id">{newId}</span>
              </p>
              {protocol ? (
                <Questionnaire
                  protocol={protocol.definition}
                  submit={async (answers) => {
                    await api(
                      "screen",
                      { patientId: newId, protocolId: protocol.id, answers },
                      mode,
                    );
                    await reload();
                  }}
                />
              ) : (
                <p>No approved questionnaire is available.</p>
              )}
              <button
                className="secondary"
                onClick={() => {
                  setModal("");
                  open(newId);
                }}
              >
                Open participant record
              </button>
            </div>
          ) : (
            <Registration
              camps={data.camps}
              demo={demo}
              save={async (d) => {
                const r = await api("register", { data: d }, mode);
                setNewId(r.id);
                await reload();
              }}
            />
          )
        ) : modal === "scan" ? (
          <Scanner
            found={async (token) => {
              const r = await api("lookup", { token }, mode);
              setModal("");
              open(r.id);
            }}
          />
        ) : modal === "camp" ? (
          <CampForm
            save={async (d: any) => {
              await api("camp", { data: d }, mode);
              await reload();
              setModal("");
            }}
          />
        ) : modal === "filters" ? (
          <div className="stack">
            <Field label="Registration date">
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
              />
            </Field>
            <Field label="Location">
              <Choice
                label="Location"
                value={location}
                options={[
                  "All locations",
                  ...new Set<string>(data.camps.map((c: any) => c.location)),
                ]}
                onChange={setLocation}
              />
            </Field>
            <Field label="Pathway / status">
              <Choice
                label="Pathway"
                value={status}
                options={[
                  "All statuses",
                  ...new Set<string>(data.patients.map((p: any) => p.pathway)),
                ]}
                onChange={setStatus}
              />
            </Field>
            <button className="primary" onClick={() => setModal("")}>
              Apply filters
            </button>
            <button
              className="secondary"
              onClick={() => {
                setDate("");
                setLocation("All locations");
                setStatus("All statuses");
                setCamp("All camps");
                setGroup("All groups");
                setSearch("");
                setModal("");
              }}
            >
              <RotateCcw size={16} /> Clear all filters
            </button>
          </div>
        ) : null}
      </Modal>
    </SidebarProvider>
  );
}
function Empty({ text }: { text: string }) {
  return (
    <div className="empty-state">
      <ClipboardList size={28} />
      <p>{text}</p>
    </div>
  );
}
function ParticipantTable({ patients, camps, open, title, more }: any) {
  return (
    <section className="panel participant-panel">
      <div className="panel-heading">
        <h2>{title}</h2>
        {more && (
          <button className="text-button" onClick={more}>
            View all participants <ArrowRight size={16} />
          </button>
        )}
      </div>
      {patients.length === 0 ? (
        <Empty text="No participants match this view." />
      ) : (
        <>
          <div className="desktop-table">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Participant</TableHead>
                  <TableHead>Screening camp</TableHead>
                  <TableHead>Group</TableHead>
                  <TableHead>Care pathway</TableHead>
                  <TableHead>
                    <span className="sr-only">Open record</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {patients.map((p: any) => (
                  <TableRow key={p.id}>
                    <TableCell>
                      <button
                        className="person-cell"
                        onClick={() => open(p.id)}
                      >
                        <span className="avatar">
                          {p.name
                            .split(" ")
                            .map((s: string) => s[0])
                            .slice(0, 2)
                            .join("")}
                        </span>
                        <span>
                          <strong>{p.name}</strong>
                          <small>{p.id.slice(0, 16)}…</small>
                        </span>
                      </button>
                    </TableCell>
                    <TableCell>
                      {camps.find((c: any) => c.id === p.camp_id)?.name ||
                        "Not assigned"}
                    </TableCell>
                    <TableCell>
                      <span className="badge">
                        {p.category ? "Group " + p.category : "Awaiting exam"}
                      </span>
                    </TableCell>
                    <TableCell>{p.pathway}</TableCell>
                    <TableCell>
                      <button
                        className="icon-button"
                        aria-label={"Open " + p.name}
                        onClick={() => open(p.id)}
                      >
                        <ArrowUpRight size={17} />
                      </button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <div className="mobile-records">
            {patients.map((p: any) => (
              <button
                key={p.id}
                className="mobile-record"
                onClick={() => open(p.id)}
              >
                <div>
                  <h3>{p.name}</h3>
                  <small>{p.id.slice(0, 18)}…</small>
                </div>
                <span className="badge">
                  {p.category ? "Group " + p.category : "Awaiting exam"}
                </span>
                <p>{p.pathway}</p>
              </button>
            ))}
          </div>
        </>
      )}
    </section>
  );
}
function CampForm({ save }: any) {
  const [d, setD] = useState({ name: "", location: "", date: "" }),
    [error, setError] = useState("");
  return (
    <form
      className="stack"
      onSubmit={async (e) => {
        e.preventDefault();
        try {
          await save(d);
        } catch (e) {
          setError((e as Error).message);
        }
      }}
    >
      {["name", "location", "date"].map((k) => (
        <Field
          label={
            k === "name" ? "Camp name" : k === "location" ? "Location" : "Date"
          }
          key={k}
        >
          <input
            type={k === "date" ? "date" : "text"}
            required
            value={(d as any)[k]}
            onChange={(e) => setD({ ...d, [k]: e.target.value })}
          />
        </Field>
      ))}
      {error && <p className="error">{error}</p>}
      <button className="primary">Create camp</button>
    </form>
  );
}
function Settings({ data, mode, reload, exportAnalysis }: any) {
  const [text, setText] = useState(
      JSON.stringify(data.protocols[0]?.definition || pilot, null, 2),
    ),
    [error, setError] = useState(""),
    [success, setSuccess] = useState(""),
    [confirmed, setConfirmed] = useState(false),
    [userOpen, setUserOpen] = useState(false);
  async function run(action: string, body: any) {
    setError("");
    setSuccess("");
    try {
      await api(action, body, mode);
      await reload();
      setSuccess("Saved successfully.");
    } catch (e) {
      setError((e as Error).message);
    }
  }
  return (
    <div className="stack">
      <section className="panel">
        <h2>DRIVE SAFE · Agreed workflow draft</h2>
        <p className="muted">
          Version 1.0 · Clinical examination determines the four-group pathway.
        </p>
        <div className="governance-grid">
          {[
            "Final privacy notice & consent",
            "Lesion criteria & urgency guidance",
            "Cessation protocol & follow-up intervals",
            "Retention, corrections & deletion policy",
          ].map((t) => (
            <div key={t}>
              <ShieldCheck size={18} />
              <span>{t}</span>
              <span className="badge">Review required</span>
            </div>
          ))}
        </div>
        <p className="notice">
          Live intake is disabled by default. The pilot draft is available for
          evaluation using synthetic data.
        </p>
      </section>
      <section className="panel stack">
        <h2>Versioned questionnaire</h2>
        <p className="muted">
          Edit the supplied question configuration. Saving creates an immutable
          draft; a doctor must approve it separately. Participant answers never
          automatically assign a clinical group.
        </p>
        <Field label="Questionnaire configuration (JSON)">
          <textarea
            className="code-editor"
            spellCheck={false}
            value={text}
            onChange={(e) => setText(e.target.value)}
          />
        </Field>
        <button
          className="primary"
          onClick={() => {
            try {
              void run("protocol", { data: JSON.parse(text) });
            } catch {
              setError("The questionnaire must be valid JSON.");
            }
          }}
        >
          Save new draft
        </button>
        {data.protocols.map((p: any) => (
          <div className="record" key={p.id}>
            <span className="badge">{p.status}</span>
            <h3>{p.version}</h3>
            {p.status === "Draft" && (
              <>
                <Check checked={confirmed} onChange={setConfirmed}>
                  I am an authorized clinician and have reviewed this exact
                  questionnaire.
                </Check>
                <button
                  className="secondary"
                  disabled={!confirmed}
                  onClick={() =>
                    run("approveProtocol", { id: p.id, confirm: true })
                  }
                >
                  Record clinical approval
                </button>
              </>
            )}
          </div>
        ))}
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
      </section>
      <section className="panel">
        <div className="panel-heading">
          <h2>Access & programme analysis</h2>
          <button className="secondary" onClick={() => setUserOpen(true)}>
            <Plus size={16} /> Staff account
          </button>
        </div>
        <p className="muted">
          Staff roles and patient assignments are enforced by the server.
          Patient accounts are linked to exactly one participant.
        </p>
        {data.users.map((u: any) => (
          <div className="record" key={u.id}>
            <h3>{u.name}</h3>
            <p>
              {u.email} · {u.role} · {u.active ? "Active" : "Disabled"}
            </p>
          </div>
        ))}
        <button className="secondary" onClick={exportAnalysis}>
          <Download size={16} /> Export de-identified programme data
        </button>
        <p className="fine">
          Names, mobile numbers, free-text notes, working areas and staff
          identifiers are excluded. Treat longitudinal IDs as pseudonymous data.
        </p>
      </section>
      <Modal
        open={userOpen}
        close={() => setUserOpen(false)}
        title="Manage an authorized account"
        description="Use the authenticated account ID supplied by your administrator."
      >
        <UserForm
          save={async (d: any) => {
            await api("user", { data: d }, mode);
            await reload();
            setUserOpen(false);
          }}
        />
      </Modal>
    </div>
  );
}
function UserForm({ save }: any) {
  const [d, setD] = useState({
      id: "",
      name: "",
      email: "",
      role: "REGISTRATION",
      patientId: "",
      active: true,
    }),
    [error, setError] = useState("");
  return (
    <form
      className="stack"
      onSubmit={async (e) => {
        e.preventDefault();
        try {
          await save({ ...d, patientId: d.patientId || null });
        } catch (e) {
          setError((e as Error).message);
        }
      }}
    >
      {["id", "name", "email"].map((k) => (
        <Field
          key={k}
          label={
            k === "id"
              ? "Authenticated account ID"
              : k === "name"
                ? "Display name"
                : "Email"
          }
        >
          <input
            required
            type={k === "email" ? "email" : "text"}
            value={(d as any)[k]}
            onChange={(e) => setD({ ...d, [k]: e.target.value })}
          />
        </Field>
      ))}
      <Choice
        label="Role"
        value={d.role}
        options={[
          "ADMIN",
          "REGISTRATION",
          "COUNSELLOR",
          "DOCTOR",
          "LAB",
          "PATIENT",
        ]}
        onChange={(v) => setD({ ...d, role: v })}
      />
      {d.role === "PATIENT" && (
        <Field label="Linked participant ID">
          <input
            required
            value={d.patientId}
            onChange={(e) => setD({ ...d, patientId: e.target.value })}
          />
        </Field>
      )}
      <Check checked={d.active} onChange={(v) => setD({ ...d, active: v })}>
        Account active
      </Check>
      {error && <p className="error">{error}</p>}
      <button className="primary">Save access settings</button>
    </form>
  );
}
