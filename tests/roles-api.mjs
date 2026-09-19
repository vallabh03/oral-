// Local-only access-control integration test. Stop the preview before running.
import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
import { spawn, execFileSync } from "node:child_process";
const base = "http://localhost:5173";
let running = false;
try {
  running = (await fetch(base)).ok;
} catch {}
if (running)
  throw new Error(
    "Stop the localhost preview before running this isolated access test.",
  );
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
execFileSync("python", [
  "-c",
  `import sqlite3,pathlib
root=pathlib.Path('.wrangler/state/v3/d1/miniflare-D1DatabaseObject');files=[p for p in root.glob('*.sqlite') if p.name!='metadata.sqlite'];assert len(files)==1
c=sqlite3.connect(files[0]);tables={r[0] for r in c.execute("SELECT name FROM sqlite_master WHERE type='table'")}
for table,name in [('sample_events','0006_sample_events.sql'),('app_sessions','0007_true_mandrill.sql'),('app_errors','0008_bumpy_sunset_bain.sql')]:
 if table not in tables:c.executescript(pathlib.Path('drizzle',name).read_text(encoding='utf8'))
c.commit()`,
]);
const oldPolicy = sql("SELECT * FROM app_settings WHERE id='security'")[0];
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
    stdio: "inherit",
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
    const session = await fetch(base + "/api/session", {
      method: "POST",
      headers: { ...headers, Cookie: cookie },
      body: "{}",
    });
    assert.equal(session.status, 200, await session.clone().text());
    const sc = session.headers.get("set-cookie");
    assert.match(sc, /HttpOnly/);
    assert.match(sc, /SameSite=Strict/);
    headers.Cookie = cookie + "; " + sc.split(";")[0];
    checks += 3;
    const sessionData = await session.json();
    assert.ok(sessionData.path.includes("/workspace/"));
    const ownPage = await fetch(base + sessionData.path, {
      headers,
      redirect: "manual",
    });
    assert.equal(ownPage.status, 200, "own role dashboard renders");
    checks++;
    if (role === "ASSISTANT") {
      const csrf = await fetch(base + "/api/session", {
        method: "POST",
        headers: { ...headers, Origin: "https://other.invalid" },
        body: "{}",
      });
      assert.equal(csrf.status, 403);
      checks++;
      const noSession = await fetch(base + "/api/care", {
        headers: { ...headers, Cookie: cookie },
      });
      assert.equal(noSession.status, 401);
      checks++;
    }
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
    const forbiddenPath =
      role === "SUPER_ADMIN" ? "/workspace/doctor" : "/workspace/super-admin";
    const forbiddenPage = await fetch(base + forbiddenPath, {
      headers,
      redirect: "manual",
    });
    assert.ok(
      [303, 307, 308].includes(forbiddenPage.status),
      "protected role page redirects",
    );
    assert.equal(forbiddenPage.headers.get("location"), sessionData.path);
    checks += 2;
    if (role === "ASSISTANT") {
      const direct = await fetch(base + "/api/admin", {
        headers: { Cookie: headers.Cookie },
      });
      assert.equal(direct.status, 403);
      checks++;
      await get("/api/admin", 403);
      await get("/api/patient-report?patient=" + pid, 403);
      await get("/api/analysis?group=not-a-group", 400);
      await post("record", {
        data: {
          kind: "assessment",
          notes: "Unauthorized observation",
          status: "Recorded",
        },
      });

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
      await get("/api/admin", 403);
      await get("/api/admin?export=backup", 403);
      for (const action of ["camp", "protocol", "assign", "qr"])
        await post(action, { data: {} });
      await get("/api/patient-report?patient=" + pid);
      const printable = await fetch(
        base + "/api/patient-report?patient=" + pid + "&format=html",
        { headers },
      );
      assert.equal(printable.status, 200);
      assert.match(await printable.text(), /Confidential/);
      checks++;
      await post("user", { data: user });
      await post("examination", { data: {} }, 400);
      await post("approveProtocol", { confirm: false }, 400);
      assert.equal(dash.audit.length, 0);
      checks++;
    } else {
      await get("/api/admin");
      await get("/api/admin?export=backup");
      const policy = await fetch(base + "/api/admin", {
        method: "POST",
        headers,
        body: JSON.stringify({
          action: "security",
          data: { idleMinutes: 5, absoluteHours: 8 },
        }),
      });
      assert.equal(policy.status, 200);
      checks++;
      const invalid = await fetch(base + "/api/admin", {
        method: "POST",
        headers,
        body: JSON.stringify({
          action: "security",
          data: { idleMinutes: 0, absoluteHours: 8 },
        }),
      });
      assert.equal(invalid.status, 400);
      checks++;
      await post("user", { data: user }, 200);
      sql(
        "INSERT INTO app_sessions(token_hash,user_id,created_at,last_seen,expires_at,revoked) VALUES (?,?,0,0,0,0)",
        ["test-session-" + stamp, user.id],
      );
      await post("user", { data: { ...user, active: false } }, 200);
      assert.equal(
        sql("SELECT revoked FROM app_sessions WHERE token_hash=?", [
          "test-session-" + stamp,
        ])[0].revoked,
        1,
      );
      checks++;

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
  sql("UPDATE app_sessions SET last_seen=0 WHERE user_id='local_seedy'");
  await get("/api/care", 401);
  const restart = await fetch(base + "/api/session", {
    method: "POST",
    headers: { ...headers, Cookie: cookie },
    body: "{}",
  });
  assert.equal(restart.status, 200);
  headers.Cookie =
    cookie + "; " + restart.headers.get("set-cookie").split(";")[0];
  checks++;
  sql("UPDATE app_sessions SET expires_at=0 WHERE user_id='local_seedy'");
  await get("/api/care", 401);
  const renewed = await fetch(base + "/api/session", {
    method: "POST",
    headers: { ...headers, Cookie: cookie },
    body: "{}",
  });
  assert.equal(renewed.status, 200);
  headers.Cookie =
    cookie + "; " + renewed.headers.get("set-cookie").split(";")[0];
  checks++;
  sql("UPDATE users SET active=0 WHERE id='local_seedy'");
  await get("/api/care", 403);
  sql("UPDATE users SET active=1 WHERE id='local_seedy'");
  const end = await fetch(base + "/api/session", {
    method: "DELETE",
    headers,
    body: "{}",
  });
  assert.equal(end.status, 200);
  checks++;
  await get("/api/care", 401);
  console.log(
    checks +
      " live-mode API access assertions passed against local synthetic data.",
  );
} finally {
  if (server?.pid) {
    try {
      execFileSync("taskkill", ["/pid", String(server.pid), "/t", "/f"], {
        stdio: "ignore",
      });
    } catch {}
  }
  writeFileSync(".env", original);
  if (oldPolicy)
    sql(
      "INSERT INTO app_settings(id,value,updated_at,updated_by) VALUES (?,?,?,?) ON CONFLICT(id) DO UPDATE SET value=excluded.value,updated_at=excluded.updated_at,updated_by=excluded.updated_by",
      [
        oldPolicy.id,
        oldPolicy.value,
        oldPolicy.updated_at,
        oldPolicy.updated_by,
      ],
    );
  else sql("DELETE FROM app_settings WHERE id='security'");
  if (old)
    sql(
      "UPDATE users SET email=?,name=?,role=?,active=?,patient_id=? WHERE id=?",
      [old.email, old.name, old.role, old.active, old.patient_id, old.id],
    );
  else sql("DELETE FROM users WHERE id='local_seedy'");
  sql("DELETE FROM users WHERE id=?", ["role-qa-new-" + stamp]);
}
