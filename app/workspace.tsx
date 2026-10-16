"use client";
import { T, useT, LanguageSelector, useLanguage } from "@/app/language";
import { localeInfo } from "@/lib/i18n/languages";
import { permitted, sectionAllowed } from "@/lib/permissions";
import { AnalyticsPanel, SystemPanel, SessionGuard } from "./role-panels";
import { hasRole, roleLabels, accountTypes } from "@/lib/domain";
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
  ["Reports", FileCheck2],
  ["Analysis & reporting", Download],
  ["Follow-ups", CalendarDays],
  ["Camps", MapPin],
  ["Protocol & settings", Settings2],
  ["Audit log", ShieldCheck],
  ["System administration", Settings2],
  ["Clinical protocol review", Stethoscope],
] as const;
const empty = {
  patients: [],
  camps: [],
  protocols: [],
  records: [],
  samples: [],
  audit: [],
  users: [],
  actor: { name: "Care team", role: "SUPER_ADMIN", demo: true },
};
export default function Workspace({
  initialMode = "demo",
  initialRole = "SUPER_ADMIN",
}: {
  initialMode?: string;
  initialRole?: string;
}) {
  const t = useT();
  const { locale } = useLanguage();
  const [view, setView] = useState(
      initialMode === "live" && initialRole === "ASSISTANT"
        ? "Analysis & reporting"
        : initialMode === "live" && initialRole === "SUPER_ADMIN"
          ? "System administration"
          : "Overview",
    ),
    [data, setData] = useState<any>(empty),
    [mode] = useState(initialMode),
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
      setData(empty);
      setSelected("");
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
  // Public registrations continue on a separate participant device. Refresh
  // staff data while the live dashboard is visible so the new registration
  // and its completed questionnaire appear without a manual page reload.
  useEffect(() => {
    if (mode !== "live") return;
    const refreshWhenVisible = () => {
      if (document.visibilityState === "visible") void reload();
    };
    const timer = window.setInterval(refreshWhenVisible, 15000);
    window.addEventListener("focus", refreshWhenVisible);
    document.addEventListener("visibilitychange", refreshWhenVisible);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", refreshWhenVisible);
      document.removeEventListener("visibilitychange", refreshWhenVisible);
    };
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
              section: {
                type: "string",
                enum: nav
                  .filter(
                    (n) => mode === "demo" || sectionAllowed(initialRole, n[0]),
                  )
                  .map((n) => n[0]),
              },
            },
            required: ["section"],
            additionalProperties: false,
          },
          annotations: { readOnlyHint: true },
          execute: (v: any) => {
            if (
              !v ||
              !nav.some((n) => n[0] === v.section) ||
              (mode !== "demo" && !sectionAllowed(initialRole, v.section))
            )
              throw new Error("Unknown section");
            setView(v.section);
            return { section: v.section };
          },
        },
        { signal: life.signal },
      ),
    ).catch(() => {});
    return () => life.abort();
  }, [mode, data.actor.role]);
  const demo = mode === "demo",
    role = mode === "live" ? initialRole : data.actor.role,
    can = (...r: string[]) => demo || hasRole(role, ...r);
  const filtered = data.patients.filter((p: any) => {
    const c = data.camps.find((c: any) => c.id === p.camp_id);
    return (
      [
        p.name,
        p.id,
        p.phone,
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
  const header =
    view === "Overview"
      ? demo
        ? "Care starts with connection."
        : initialRole === "DOCTOR_ADMIN"
          ? "Doctor dashboard"
          : "Care dashboard"
      : view;
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
      const blob = new Blob([JSON.stringify(j, null, 2)], {
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
      <SessionGuard mode={mode} />
      <Sidebar side={localeInfo(locale).dir === "rtl" ? "right" : "left"} className="care-sidebar">
        <SidebarHeader>
          <a className="brand" href="/campaign">
            <span className="brand-mark">
              <Activity />
            </span>
            <span><T text={"TELANGANA"} /><span><T text={"AGAINST ORAL CANCER"} /></span>
            </span>
          </a>
          <div className="program-tag"><T text={"DRIVE SAFE "} /><span><T text={"PILOT"} /></span>
          </div>
          <div className="workspace-label"><T text={"CARE COORDINATION"} /></div>
        </SidebarHeader>
        <SidebarContent>
          <SidebarMenu>
            {nav
              .filter(([t]) => demo || sectionAllowed(role, t))
              .map(([title, Icon]) => (
                <SidebarMenuItem key={title}>
                  <SidebarMenuButton
                    isActive={view === title}
                    onClick={() => setView(title)}
                  >
                    <Icon />
                    <span><T text={title} /></span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
          </SidebarMenu>
        </SidebarContent>
        <SidebarFooter>
          <a className="campaign-link" href="/campaign"><T text={"Visit campaign page "} /><ArrowUpRight size={16} />
          </a>
          <div className="staff">
            <span className="avatar">
              {demo ? "DC" : data.actor.name.slice(0, 2).toUpperCase()}
            </span>
            <div>
              {demo ? "Demo care team" : data.actor.name}
              <small>
                {demo
                  ? "Demonstration workspace"
                  : roleLabels[role] || role.toLowerCase()}
              </small>
            </div>
          </div>
          <button
            className="text-button"
            onClick={async () => {
              try {
                await api("sessionEnd", {}, mode);
                if (mode === "live")
                  await fetch("/api/session", {
                    method: "DELETE",
                    headers: { "Content-Type": "application/json" },
                    body: "{}",
                  });
              } finally {
                window.location.assign(
                  "/signout-with-chatgpt?return_to=/campaign",
                );
              }
            }}
          ><T text={"Sign out"} /></button>
        </SidebarFooter>
      </Sidebar>
      <div className="workspace">
        <header className="topbar">
<LanguageSelector />
          <div className="flex items-center gap-3">
            <SidebarTrigger />
            <span><T text={"DRIVE SAFE "} /><span className="slash">/</span> <T>{view}</T>
            </span>
          </div>
          <div className="action-row">
            <span className="badge role-badge">
              <T>{demo ? "Synthetic demonstration" : roleLabels[role] || role}</T>
            </span>
            <button
              className="icon-button"
              title={t("Scan participant QR")}
              aria-label={t("Scan participant QR")}
              onClick={() => setModal("scan")}
            >
              <ScanLine size={20} />
            </button>
            <Choice
              label="Workspace mode"
              value={demo ? "Demonstration" : "Live workspace"}
              options={["Demonstration", "Live workspace"]}
              onChange={(v) => {
                window.location.assign(
                  v === "Demonstration" ? "/workspace/demo" : "/workspace",
                );
              }}
            />
          </div>
        </header>
        <main className="main-content">
          <div className="page-heading">
            <div>
              <p className="eyebrow"><T text={"TELANGANA AGAINST ORAL CANCER · DRIVE SAFE"} /></p>
              <h1><T text={header} /></h1>
              <p>
                <T>{view === "Overview"
                  ? "A clear view of your screening program and every next step."
                  : "Connected records. Clear responsibilities. Continuous care."}</T>
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
                <Plus size={18} /><T text={" Register participant"} /></button>
            )}
          </div>
          <div className="notice">
            <ShieldCheck size={18} />
            <span>
              <T>{demo
                ? "Demonstration · Synthetic records only. Provisional pilot workflow; live intake is locked until governance review."
                : "Authorized workspace · Access is limited to your role and assigned participants."}</T>
            </span>
          </div>
          {error && (
            <section className="error-panel" role="alert">
              <h2><T text={"Workspace unavailable"} /></h2>
              <p><T text={error} /></p>
              <div className="action-row">
                <a className="primary" href="/workspace" target="_top"><T text={"Sign in"} /></a>
                <button className="secondary" onClick={reload}><T text={"Try again"} /></button>
              </div>
            </section>
          )}
          {!error && (
            <>
              {![
                "Analysis & reporting",
                "System administration",
                "Protocol & settings",
                "Clinical protocol review",
                "Audit log",
              ].includes(view) && (
                <div className="filters">
                  <div className="search-box">
                    <Search size={17} />
                    <input
                      aria-label={t("Search participants")}
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      placeholder={t("Search name, participant ID or mobile")}
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
                    aria-label={t("More filters")}
                  >
                    <SlidersHorizontal size={18} />
                  </button>
                </div>
              )}
              {loading ? (
                <div className="panel loading"><T text={"Loading your care workspace…"} /></div>
              ) : view === "Overview" ? (
                <>
                  <div className="section-line">
                    <h2><T text={"Campaign overview"} /></h2>
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
                        "Follow-ups pending",
                        followups.length,
                        "Continue the care journey",
                        CalendarDays,
                      ],
                    ].map(([label, value, note, Icon]: any) => (
                      <article className="metric" key={label}>
                        <div>
                          <T>{label}</T>
                          <Icon size={18} />
                        </div>
                        <strong>{value}</strong>
                        <small><T>{note}</T></small>
                      </article>
                    ))}
                  </div>
                  <div className="overview-grid">
                    <section className="panel">
                      <div className="panel-heading">
                        <h2><T text={"Every screening. A next step."} /></h2>
                        <span className="badge"><T text={"4-group framework"} /></span>
                      </div>
                      <p className="muted"><T text={"Habit status + clinician-determined lesion status."} /></p>
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
                              <h3><T>{label}</T></h3>
                              <small><T>{detail}</T></small>
                            </div>
                            <strong>{counts[i]}</strong>
                          </button>
                        ))}
                      </div>
                      <div className="panel-foot"><T text={"Groups guide management. They are not a cancer diagnosis."} /><ShieldCheck size={16} />
                      </div>
                    </section>
                    <section className="priority-card">
                      <div className="eyebrow"><T text={"KEEP CARE MOVING"} /></div>
                      <h2><T text={"A little follow-up."} /><br /><T text={"A meaningful next step."} /></h2>
                      <p><T text={"Bring the right people to the right care, at the right time."} /></p>
                      <button onClick={() => setView("Follow-ups")}><T text={"Review follow-ups "} /><ArrowRight size={18} />
                      </button>
                      <div className="priority-stat">
                        <strong>
                          {followups.length.toString().padStart(2, "0")}
                        </strong>
                        <span><T text={"participants awaiting"} /><br /><T text={"their next conversation"} /></span>
                      </div>
                      <p className="priority-bottom"><T text={"Follow-up dates are selected by the clinical team."} /></p>
                    </section>
                  </div>
                  <ParticipantTable
                    patients={filtered.slice(0, 5)}
                    camps={data.camps}
                    open={open}
                    title={t("Recent participants")}
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
                      ["Reports ready", filtered.filter((p: any) => p.category).length],
                    ].map(([label, n]) => (
                      <div key={label}>
                        <strong>{n}</strong>
                        <span><T>{label}</T></span>
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
                  "Follow-ups",
                ].includes(view) ? (
                <section className="panel">
                  <div className="panel-heading">
                    <h2>
                      {view === "Cessation support"
                        ? "Cessation intervention queue"
                          : "Continuing the care journey"}
                    </h2>
                    <span className="badge"><T text={"Assigned care"} /></span>
                  </div>
                  {records(
                    view === "Cessation support"
                      ? "counselling"
                        : "followup",
                  ).length === 0 ? (
                    <Empty text="No records match these filters." />
                  ) : (
                    records(
                      view === "Cessation support"
                        ? "counselling"
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
                        <span className="badge"><T>{r.status}</T></span>
                        <ArrowRight size={16} />
                      </button>
                    ))
                  )}
                </section>
              ) : view === "Reports" ? (
                <section className="panel">
                  <div className="panel-heading">
                    <h2><T text={"Patient screening reports"} /></h2>
                    <span className="badge"><T text={"Clinician verified"} /></span>
                  </div>
                  <p className="muted"><T text={"Open a participant to review, print or send a clinician-verified screening report."} /></p>
                  {filtered.filter((p: any) => p.category).length === 0 ? (
                    <Empty text="No verified screening reports match these filters." />
                  ) : (
                    filtered.filter((p: any) => p.category).map((p: any) => (
                        <button
                          className="queue-row"
                          key={p.id}
                          onClick={() => open(p.id)}
                        >
                          <FileCheck2 size={22} />
                          <div>
                            <h3>{p.name}</h3>
                            <p className="patient-id">{p.id}</p>
                          </div>
                          <span className="badge"><T text={"Group "} />{p.category}</span>
                          <ArrowRight size={16} />
                        </button>
                      ))
                  )}
                </section>
              ) : view === "Camps" ? (
                <>
                  <div className="section-line">
                    <h2><T text={"Screening events"} /></h2>
                    <button
                      className="secondary"
                      onClick={() => setModal("camp")}
                    >
                      <Plus size={16} /><T text={" Add camp"} /></button>
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
                            }{" "}<T text={"participants"} /></span>
                          <button
                            className="text-button"
                            onClick={() => {
                              setCamp(c.name);
                              setView("Participants");
                            }}
                          ><T text={"View participants "} /><ArrowRight size={15} />
                          </button>
                        </div>
                      </section>
                    ))}
                  </div>
                  <section className="panel public-qr">
                    <div>
                      <h2><T text={"One programme. One entry point."} /></h2>
                      <p><T text={"Registration, consent and the brief participant questionnaire."} /></p>
                      <p className="muted"><T text={"Clinician fields and prior submissions are never accessible from this QR."} /></p>
                      <a className="text-button" href="/register"><T text={"Open participant entry "} /><ArrowUpRight size={16} />
                      </a>
                    </div>
                    {entryUrl && <QRImage value={entryUrl} />}
                  </section>
                </>
              ) : view === "Analysis & reporting" ? (
                <AnalyticsPanel mode={mode} />
              ) : view === "System administration" ? (
                <SystemPanel mode={mode} />
              ) : view === "Clinical protocol review" ? (
                <section className="panel stack">
                  <h2><T text={"Clinical protocol review"} /></h2>
                  <p><T text={"Review the complete questionnaire before recording clinical approval. Technical settings and user permissions are managed separately."} /></p>
                  {data.protocols.map((p: any) => (
                    <ClinicalReview
                      key={p.id}
                      protocol={p}
                      mode={mode}
                      reload={reload}
                    />
                  ))}
                </section>
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
                    <h2><T text={"Accountability, at every step."} /></h2>
                    <span className="badge"><T text={"Append-only events"} /></span>
                  </div>
                  <p className="muted"><T text={"Authorized administrator view · Most recent 200 events"} /></p>
                  <div className="timeline">
                    {data.audit.map((e: any) => (
                      <div key={e.id}>
                        <ShieldCheck size={17} />
                        <section>
                          <h3>{e.action}</h3>
                          <p>{new Date(e.at).toLocaleString()}</p>
                          <small className="patient-id">
                            {e.patient_id || "Programme event"}<T text={" · Actor"} />{" "}
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
        <footer><T text={"Consent-led screening. Clinician-led care."} /><span><T text={"DRIVE SAFE · HAOC"} /></span>
        </footer>
      </div>
      <Sheet open={!!selected} onOpenChange={(v) => !v && setSelected("")}>
        <SheetContent className="patient-sheet">
          <SheetHeader>
            <SheetTitle><T text={"Participant record"} /></SheetTitle>
            <SheetDescription>
              <T>{demo
                ? "Synthetic demonstration record"
                : "Authorized care record"}</T>{" "}<T text={"· DRIVE SAFE"} /></SheetDescription>
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
              <p className="notice"><T text={"Registration saved. Your permanent ID:"} />{" "}
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
                <p><T text={"No approved questionnaire is available."} /></p>
              )}
              <button
                className="secondary"
                onClick={() => {
                  setModal("");
                  open(newId);
                }}
              ><T text={"Open participant record"} /></button>
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
            <button className="primary" onClick={() => setModal("")}><T text={"Apply filters"} /></button>
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
              <RotateCcw size={16} /><T text={" Clear all filters"} /></button>
          </div>
        ) : null}
      </Modal>
    </SidebarProvider>
  );
}
function Empty({ text }: { text: string }) {
  const t = useT();
  return (
    <div className="empty-state">
      <ClipboardList size={28} />
      <p>{text}</p>
    </div>
  );
}
function ParticipantTable({ patients, camps, open, title, more }: any) {
  const t = useT();
  return (
    <section className="panel participant-panel">
      <div className="panel-heading">
        <h2><T>{title}</T></h2>
        {more && (
          <button className="text-button" onClick={more}><T text={"View all participants "} /><ArrowRight size={16} />
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
                  <TableHead><T text={"Participant"} /></TableHead>
                  <TableHead><T text={"Screening camp"} /></TableHead>
                  <TableHead><T text={"Group"} /></TableHead>
                  <TableHead><T text={"Care pathway"} /></TableHead>
                  <TableHead>
                    <span className="sr-only"><T text={"Open record"} /></span>
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
  const t = useT();
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
      {error && <p className="error"><T text={error} /></p>}
      <button className="primary"><T text={"Create camp"} /></button>
    </form>
  );
}
function Settings({ data, mode, reload, exportAnalysis }: any) {
  const t = useT();
  const systemAdmin = data.actor.demo || data.actor.role === "SUPER_ADMIN";
  const clinician = data.actor.demo || hasRole(data.actor.role, "DOCTOR");
  const [editingUser, setEditingUser] = useState<any>(null);
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
        <h2><T text={"DRIVE SAFE · Agreed workflow draft"} /></h2>
        <p className="muted"><T text={"Version 1.0 · Clinical examination determines the four-group pathway."} /></p>
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
              <span className="badge"><T text={"Review required"} /></span>
            </div>
          ))}
        </div>
        <p className="notice"><T text={"Live intake is disabled by default. The pilot draft is available for evaluation using synthetic data."} /></p>
      </section>
      <section className="panel stack">
        <h2><T text={"Versioned questionnaire"} /></h2>
        <p className="muted"><T text={"Edit the supplied question configuration. Saving creates an immutable draft; a doctor must approve it separately. Participant answers never automatically assign a clinical group."} /></p>
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
        ><T text={"Save new draft"} /></button>
        {data.protocols.map((p: any) => (
          <div className="record" key={p.id}>
            <span className="badge">{p.status}</span>
            <h3>{p.version}</h3>
            {p.status === "Draft" && clinician && (
              <>
                <Check checked={confirmed} onChange={setConfirmed}><T text={"I am an authorized clinician and have reviewed this exact questionnaire."} /></Check>
                <button
                  className="secondary"
                  disabled={!confirmed}
                  onClick={() =>
                    run("approveProtocol", { id: p.id, confirm: true })
                  }
                ><T text={"Record clinical approval"} /></button>
              </>
            )}
          </div>
        ))}
        {error && (
          <p className="error" role="alert">
            <T>{error}</T>
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
          <h2><T text={"Access & programme analysis"} /></h2>
          {systemAdmin && (
            <button
              className="secondary"
              onClick={() => {
                setEditingUser(null);
                setUserOpen(true);
              }}
            >
              <Plus size={16} /><T text={" Staff account"} /></button>
          )}
        </div>
        <p className="muted"><T text={"Doctor – Admin manages clinical care. Tech Support – Super Admin manages accounts and system administration. Assistant – Data & Reporting has read-only review and report generation."} /></p>
        {data.users.map((u: any) => (
          <div className="record" key={u.id}>
            <h3>{u.name}</h3>
            <p>
              {u.email} · <T>{roleLabels[u.role] || u.role}</T> ·{" "}
              <T>{u.active ? "Active" : "Disabled"}</T>
            </p>
            {systemAdmin && (
              <button
                className="secondary"
                onClick={() => {
                  setEditingUser(u);
                  setUserOpen(true);
                }}
              ><T text={"Edit access"} /></button>
            )}
          </div>
        ))}
        <button className="secondary" onClick={exportAnalysis}>
          <Download size={16} /><T text={" Export de-identified programme data"} /></button>
        <p className="fine"><T text={"Names, mobile numbers, free-text notes, working areas and staff identifiers are excluded. Treat longitudinal IDs as pseudonymous data."} /></p>
      </section>
      <Modal
        open={userOpen}
        close={() => setUserOpen(false)}
        title={t("Manage an authorized account")}
        description="Use the authenticated account ID supplied by your administrator."
      >
        <UserForm
          key={editingUser?.id || "new"}
          initial={editingUser}
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
function UserForm({ save, initial }: any) {
  const t = useT();
  const [d, setD] = useState({
      id: "",
      name: "",
      email: "",
      role: "ASSISTANT",
      patientId: "",
      ...initial,
      active: initial ? !!initial.active : true,
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
            disabled={k === "id" && !!initial}
            type={k === "email" ? "email" : "text"}
            value={(d as any)[k]}
            onChange={(e) => setD({ ...d, [k]: e.target.value })}
          />
        </Field>
      ))}
      <Choice
        label="Role"
        value={d.role}
        options={[...accountTypes]}
        labels={roleLabels} translateLabels
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
      <Check checked={d.active} onChange={(v) => setD({ ...d, active: v })}><T text={"Account active"} /></Check>
      {error && <p className="error"><T text={error} /></p>}
      <button className="primary"><T text={"Save access settings"} /></button>
    </form>
  );
}

function ClinicalReview({ protocol, mode, reload }: any) {
  const t = useT();
  const [confirmed, setConfirmed] = useState(false),
    [error, setError] = useState("");
  return (
    <article className="record">
      <h3>
        {protocol.version} · {protocol.status}
      </h3>
      <details>
        <summary><T text={"Read complete protocol"} /></summary>
        <pre className="protocol-preview">
          {JSON.stringify(protocol.definition, null, 2)}
        </pre>
      </details>
      {protocol.status === "Draft" && (
        <>
          <Check checked={confirmed} onChange={setConfirmed}><T text={"I am an authorised clinician and have reviewed this exact protocol."} /></Check>
          <button
            className="secondary"
            disabled={!confirmed}
            onClick={async () => {
              try {
                await api(
                  "approveProtocol",
                  { id: protocol.id, confirm: true },
                  mode,
                );
                await reload();
              } catch (e) {
                setError((e as Error).message);
              }
            }}
          ><T text={"Record clinical approval"} /></button>
        </>
      )}
      {error && <p className="error"><T text={error} /></p>}
    </article>
  );
}
