import assert from "node:assert/strict";
const base = "http://localhost:5173";
let checks = 0;
const check = (v, msg) => {
  assert.ok(v, msg);
  checks++;
};
let r = await fetch(base + "/api/care");
check(r.status === 401, "anonymous records denied");
r = await fetch(base + "/signin-with-chatgpt?return_to=/", {
  redirect: "manual",
});
const cookie = r.headers.get("set-cookie")?.split(";")[0];
check(!!cookie, "local test identity");
const headers = {
  "Content-Type": "application/json",
  Origin: base,
  Cookie: cookie,
  "x-care-mode": "demo",
};
async function call(action, body = {}, status = 200) {
  const r = await fetch(base + "/api/care", {
    method: "POST",
    headers,
    body: JSON.stringify({ action, ...body }),
  });
  const j = await r.json();
  assert.equal(r.status, status, action + ": " + JSON.stringify(j));
  checks++;
  return j;
}
await call("seed");
let dashboard = await (await fetch(base + "/api/care", { headers })).json();
check(dashboard.camps.length > 0, "persistent camp");
const reg = {
  name: "Demo QA " + Date.now(),
  phone: "0000000009",
  age: 45,
  campId: dashboard.camps[0].id,
  driverType: "Auto",
  workingArea: "Demo stand",
  recruitment: "Stand",
  contactIntended: true,
  registrationConsent: true,
  screeningConsent: true,
  whatsappReportConsent: true,
};
await call("register", { data: { ...reg, screeningConsent: false } }, 400);
const p = await call("register", { data: reg });
check(p.id.startsWith("HAOC-DS-"), "programme identifier");
await call("register", { data: reg }, 409);
const pid = p.id,
  protocol = dashboard.protocols[0];
const answers = {
  habits: ["Bidi"],
  duration: "5–10 years",
  frequency: "1–5 times per day",
  symptoms: ["None"],
  awareness: true,
  warning_awareness: true,
  previous_screening: "No",
  cessation_interest: "Maybe",
};
await call(
  "screen",
  {
    patientId: pid,
    protocolId: protocol.id,
    answers: { ...answers, habits: ["Bidi", "None"] },
  },
  422,
);
await call("screen", { patientId: pid, protocolId: protocol.id, answers });
let detail = await (
  await fetch(base + "/api/care?patient=" + pid, { headers })
).json();
check(detail.patient.category === null, "questionnaire cannot classify");
check(detail.answers.length === 8, "visible answers preserved");
await call(
  "record",
  {
    patientId: pid,
    data: {
      kind: "treatment",
      status: "Approved",
      notes: "Synthetic clinical decision for test",
    },
  },
  409,
);
await call(
  "sample",
  {
    patientId: pid,
    data: { type: "Oral sample", location: "Demo collection", labId: null },
  },
  410,
);
for (const [habit, lesion, group] of [
  [false, false, "1"],
  [false, true, "2"],
  [true, false, "3"],
  [true, true, "4"],
]) {
  const d = {
    completed: true,
    habit,
    lesion,
    verified: true,
    mouthOpening: "Normal",
    distance: null,
    findings: [lesion ? "Ulcer" : "No abnormality"],
    site: [lesion ? "Tongue" : "N/A"],
    impression: lesion ? "Uncertain—specialist evaluation required" : "Normal",
    notes: "Synthetic clinician examination",
    recommendedTests: "Oral sample — synthetic test recommendation",
    referral: lesion ? "Planned-routine" : "No",
    destination: lesion ? "Government hospital" : "Not applicable",
    followupRequired: habit,
    followupDate: null,
  };
  const exam = await call("examination", { patientId: pid, data: d });
  check(exam.group === group, "correct group " + group);
}
await call("record", { patientId: pid, data: { kind: "referral", status: "Pending", notes: "Synthetic referral" } }, 410);
await call("sampleStatus", { patientId: pid, sampleId: "old", status: "Processing", revision: 0 }, 410);
await call("verifyReport", { patientId: pid, reportId: "old" }, 410);
r = await fetch(base + "/api/report", { method: "POST", headers: { Origin: base, Cookie: cookie, "x-care-mode": "demo" } });
check(r.status === 410, "laboratory upload retired");
r = await fetch(base + "/api/whatsapp-report?patient=" + pid + "&mode=demo", { headers });
const whatsappStatus = await r.json();
check(r.status === 200 && whatsappStatus.consented && !whatsappStatus.configured, "separate WhatsApp consent; demo sending disabled");
r = await fetch(base + "/api/whatsapp-report?patient=" + pid + "&mode=demo&format=pdf", { headers });
check(r.status === 200 && (await r.text()).startsWith("%PDF-"), "clinician-verified PDF preview");
r = await fetch(base + "/api/whatsapp-report", { method: "POST", headers, body: JSON.stringify({ patientId: pid, confirm: true }) });
check(r.status === 403, "demo cannot send WhatsApp messages");
const qr = await call("qr", { patientId: pid });
check(
  !qr.token.includes(pid) && !qr.token.includes(reg.name),
  "QR contains no identity",
);
check(
  (await call("lookup", { token: qr.token })).id === pid,
  "authorized QR lookup",
);
await call("qr", { patientId: pid });
await call("lookup", { token: qr.token }, 404);
r = await fetch(base + "/api/care", {
  headers: { ...headers, "x-care-mode": "live" },
});
check(r.status === 503, "live intake locked");
r = await fetch(base + "/api/intake");
check((await r.json()).enabled === false, "public intake locked");
const exported = await (
  await fetch(base + "/api/analysis", { headers })
).json();
check(
  !JSON.stringify(exported).includes(reg.name) &&
    !JSON.stringify(exported).includes(reg.phone),
  "analysis excludes direct identifiers",
);
await call("record", {
  patientId: pid,
  data: {
    kind: "followup",
    status: "Scheduled",
    date: "2026-10-01",
    notes: "Synthetic follow-up plan",
  },
});
detail = await (
  await fetch(base + "/api/care?patient=" + pid, { headers })
).json();
const follow = detail.records.find(
  (r) => r.kind === "followup" && r.status === "Scheduled",
);
await call("record", {
  patientId: pid,
  recordId: follow.id,
  data: {
    kind: "followup",
    status: "Completed",
    date: "2026-10-01",
    notes: "Synthetic follow-up completed",
  },
});
detail = await (
  await fetch(base + "/api/care?patient=" + pid, { headers })
).json();
check(
  detail.records.find((r) => r.id === follow.id).status === "Completed",
  "workflow updates same longitudinal record",
);
check(
  detail.records.some((r) => r.kind === "history:followup"),
  "previous workflow version preserved",
);
console.log(
  checks +
    " API assertions passed, including registration, consent, four groups, report safety, QR revocation, and fail-closed access.",
);
