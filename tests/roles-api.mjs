// Local-only access-control integration test. Stop the preview before running.
import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
import { spawn, execFileSync } from "node:child_process";
const base = "http://localhost:5173";
const original = readFileSync(".env");
const sql = (query, args = []) =>
  JSON.parse(
    execFileSync(
      "python",
      [
        "-c",
        `import sqlite3,pathlib,json,sys
files=[p for p in pathlib.Path('.wrangler/state/v3/d1/miniflare-D1DatabaseObject').glob('*.sqlite') if p.name!='metadata.sqlite']
assert len(files)==1
c=sqlite3.connect(files[0]);c.row_factory=sqlite3.Row
r=c.execute(sys.argv[1],json.loads(sys.argv[2])); rows=[dict(x) for x in r.fetchall()];c.commit();print(json.dumps(rows))`,
        query,
        JSON.stringify(args),
      ],
      { encoding: "utf8" },
    ),
  );
const old = sql("SELECT * FROM users WHERE id='local_seedy'")[0];
const stamp = Date.now(),
  pid = "ROLE-QA-" + stamp;
let server,
  checks = 0;
try {
  writeFileSync(
    ".env",
    original
      .toString()
      .replace(/^LIVE_INTAKE_ENABLED=.*$/m, "LIVE_INTAKE_ENABLED=true")
      .replace(/^AUDIT_KEY=.*$/m, "AUDIT_KEY=local-role-integration-test-only"),
  );
  server = spawn(process.execPath, ["scripts/run-framework.mjs", "dev"], {
    stdio: "ignore",
    windowsHide: true,
  });
  for (let i = 0; i < 50; i++) {
    try {
      if ((await fetch(base)).ok) break;
    } catch {}
    await new Promise((r) => setTimeout(r, 500));
  }
  const login = await fetch(
    base + "/signin-with-chatgpt?return_to=/workspace",
    { redirect: "manual" },
  );
  const cookie = login.headers.get("set-cookie")?.split(";")[0];
  assert.ok(cookie);
  const headers = {
    Cookie: cookie,
    "Content-Type": "application/json",
    Origin: base,
    "x-care-mode": "live",
  };
  sql(
    "INSERT INTO patients(id,tenant,name,phone,created_at) VALUES (?,'live','Synthetic Role QA','',?)",
    [pid, new Date().toISOString()],
  );
  async function get(path, status = 200) {
    const r = await fetch(base + path, { headers });
    assert.equal(r.status, status, path);
    checks++;
    return r.json();
  }
  async function post(action, data = {}, status = 403) {
    const r = await fetch(base + "/api/care", {
      method: "POST",
      headers,
      body: JSON.stringify({ action, patientId: pid, ...data }),
    });
    const j = await r.json();
    assert.equal(r.status, status, action + ": " + JSON.stringify(j));
    checks++;
    return j;
  }
  for (const role of ["ASSISTANT", "DOCTOR_ADMIN", "SUPER_ADMIN"]) {
    sql(
      "INSERT INTO users(id,email,name,role,active) VALUES ('local_seedy','seedy@sites.test','Synthetic Role QA',?,1) ON CONFLICT(id) DO UPDATE SET role=excluded.role,active=1",
      [role],
    );
    const dash = await get("/api/care");
    assert.equal(dash.actor.role, role);
    checks++;
    await get("/api/care?patient=" + pid);
    const report = await get("/api/analysis");
    assert.ok(report.sampleStatusTotals);
    assert.ok(!JSON.stringify(report).includes("Synthetic Role QA"));
    checks++;
    const user = {
      id: "role-qa-new-" + stamp,
      name: "Synthetic New User",
      email: "qa@example.invalid",
      role: "ASSISTANT",
      patientId: null,
      active: true,
    };
    if (role === "ASSISTANT") {
      for (const action of [
        "register",
        "camp",
        "protocol",
        "approveProtocol",
        "user",
        "screen",
        "examination",
        "consent",
        "assign",
        "sample",
        "sampleStatus",
        "verifyReport",
        "linkReport",
      ])
        await post(action, { data: {} });
      const upload = await fetch(base + "/api/report", {
        method: "POST",
        headers,
        body: "{}",
      });
      assert.equal(upload.status, 403);
      checks++;
      assert.equal(dash.users.length, 0);
      assert.equal(dash.audit.length, 0);
      checks += 2;
    } else if (role === "DOCTOR_ADMIN") {
      await post("user", { data: user });
      await post("examination", { data: {} }, 400);
      await post("approveProtocol", { confirm: false }, 400);
      assert.equal(dash.audit.length, 0);
      checks++;
    } else {
      await post("user", { data: user }, 200);
      await post(
        "user",
        { data: { ...user, id: "local_seedy", role: "ASSISTANT" } },
        400,
      );
      await post("user", { data: { ...user, role: "ADMIN" } }, 400);
      await post("examination", { data: {} });
      await post("approveProtocol", { confirm: false });
    }
  }
  console.log(
    checks +
      " live-mode API access assertions passed against local synthetic data.",
  );
} finally {
  writeFileSync(".env", original);
  if (server?.pid)
    execFileSync("taskkill", ["/pid", String(server.pid), "/t", "/f"], {
      stdio: "ignore",
    });
  if (old)
    sql(
      "UPDATE users SET email=?,name=?,role=?,active=?,patient_id=? WHERE id=?",
      [old.email, old.name, old.role, old.active, old.patient_id, old.id],
    );
  else sql("DELETE FROM users WHERE id='local_seedy'");
  sql("DELETE FROM users WHERE id=?", ["role-qa-new-" + stamp]);
}
