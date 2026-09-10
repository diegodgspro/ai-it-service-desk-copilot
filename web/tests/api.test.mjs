import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { build } from "esbuild";
import { Miniflare, convertV4MiniflareOptions } from "miniflare";
let mf, db, script, persist;
const bindings = { APP_ENV: "local", LOCAL_DEV_IDENTITY: "enabled" };
const start = (vars = bindings) =>
  new Miniflare(
    convertV4MiniflareOptions({
      modules: true,
      script,
      compatibilityDate: "2026-09-09",
      bindings: vars,
      d1Databases: { DB: "test-db" },
      resourcePersistencePath: persist,
    }),
  );
async function call(
  path = "",
  method = "GET",
  body,
  headers = {},
  runtime = mf,
  host = "http://localhost",
) {
  const response = await runtime.dispatchFetch(host + "/api/tickets" + path, {
    method,
    headers: {
      ...(body ? { "Content-Type": "application/json", Origin: host } : {}),
      ...headers,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: response.status, data: await response.json() };
}
const get = async (id = "INC-1042") => (await call("/" + id)).data;
before(async () => {
  const out = await build({
    entryPoints: ["worker/index.ts"],
    bundle: true,
    write: false,
    format: "esm",
    platform: "browser",
  });
  script = out.outputFiles[0].text;
  persist = await mkdtemp(join(tmpdir(), "service-desk-test-"));
  mf = start();
  db = await mf.getD1Database("DB");
  for (const name of (await readdir("migrations"))
    .filter((n) => n.endsWith(".sql"))
    .sort()) {
    // SQLite exec accepts multiple statements; collapse newlines for the D1 exec API.
    await db.exec(
      (await readFile("migrations/" + name, "utf8"))
        .replace(/^--.*$/gm, "")
        .replaceAll("\n", " "),
    );
  }
});
after(async () => {
  await mf?.dispose();
  await rm(persist, { recursive: true, force: true });
});
test("all nine priorities match the Python source matrix", async () => {
  const localPython = resolve("../.venv/Scripts/python.exe");
  const python = existsSync(localPython) ? localPython : "python";
  const source = execFileSync(
    python,
    [
      "-c",
      "import ast,json; t=ast.parse(open('../src/engine.py',encoding='utf-8').read()); print(json.dumps(next(ast.literal_eval(n.value) for n in t.body if isinstance(n,ast.Assign) and any(isinstance(x,ast.Name) and x.id=='MATRIX' for x in n.targets))))",
    ],
    { encoding: "utf8" },
  );
  const matrix = JSON.parse(source);
  for (const impact of ["Low", "Medium", "High"])
    for (const urgency of ["Low", "Medium", "High"]) {
      let { ticket } = await get();
      assert.equal(
        (
          await call("/" + ticket.id, "PATCH", {
            version: ticket.version,
            title: ticket.title,
            description: ticket.description,
            impact,
            urgency,
          })
        ).status,
        200,
      );
      ({ ticket } = await get());
      assert.equal(
        (
          await call("/" + ticket.id + "/analyze", "POST", {
            version: ticket.version,
          })
        ).status,
        200,
      );
      assert.equal(
        (await get()).ticket.analysis.priority,
        matrix[impact][urgency],
      );
    }
});
test("all eight synthetic incidents produce their authored runbooks without scores", async () => {
  const tickets = JSON.parse(
    await readFile("../sample_data/tickets.json", "utf8"),
  );
  const expected = [
    "Account lockout",
    "VPN",
    "DNS",
    "Printing",
    "Windows 11",
    "Microsoft 365",
    "Shared folder",
    "ERP",
  ];
  for (let i = 0; i < tickets.length; i++) {
    let { ticket } = await get(tickets[i].id);
    await call("/" + ticket.id + "/analyze", "POST", {
      version: ticket.version,
    });
    const a = (await get(ticket.id)).ticket.analysis;
    assert.equal(a.category, expected[i]);
    assert.ok(a.steps.length);
    assert.ok(a.evidence[0].content);
    assert.equal(a.mode, "Deterministic runbook matching");
    assert.equal(a.confidence, undefined);
    assert.equal(a.confidence_score, undefined);
  }
});
test("approval is versioned, single-use, server allowlisted and invalidated by edits and reanalysis", async () => {
  let { ticket } = await get("INC-1044");
  assert.equal(
    (
      await call("/" + ticket.id + "/decision", "POST", {
        version: ticket.version,
        analysisId: "stale",
        decision: "approved",
      })
    ).status,
    409,
  );
  const payload = {
    version: ticket.version,
    analysisId: ticket.analysis_id,
    decision: "approved",
    actionId: "run-shell",
    actor: "spoofed",
  };
  const results = await Promise.all([
    call("/" + ticket.id + "/decision", "POST", payload),
    call("/" + ticket.id + "/decision", "POST", payload),
  ]);
  assert.deepEqual(results.map((r) => r.status).sort(), [200, 409]);
  let record = await get(ticket.id);
  assert.equal(record.ticket.decision, "approved");
  const events = record.audit.filter((e) => e.kind === "simulation");
  assert.equal(events.length, 1);
  assert.equal(events[0].actor, "local-lab-technician");
  assert.match(events[0].detail, /Print Spooler/);
  assert.doesNotMatch(events[0].detail, /run-shell/);
  ticket = record.ticket;
  await call("/" + ticket.id + "/analyze", "POST", { version: ticket.version });
  record = await get(ticket.id);
  assert.equal(record.ticket.decision, null);
  assert.notEqual(record.ticket.analysis_id, ticket.analysis_id);
  ticket = record.ticket;
  await call("/" + ticket.id, "PATCH", {
    version: ticket.version,
    title: ticket.title,
    description: ticket.description + " Updated lab details.",
    impact: ticket.impact,
    urgency: ticket.urgency,
  });
  record = await get(ticket.id);
  assert.equal(record.ticket.analysis, null);
  assert.equal(record.ticket.analysis_id, null);
  assert.equal(record.ticket.decision, null);
  assert.equal(
    (
      await call("/" + ticket.id + "/decision", "POST", {
        version: record.ticket.version,
        analysisId: ticket.analysis_id,
        decision: "approved",
      })
    ).status,
    409,
  );
});
test("handover requires a current analysis, a note and explicit restoration confirmation", async () => {
  let { ticket } = await get("INC-1044");
  assert.equal(
    (
      await call("/" + ticket.id + "/handover", "POST", {
        version: ticket.version,
        status: "Resolved",
        note: "Lab restored",
        restored: true,
      })
    ).status,
    409,
  );
  await call("/" + ticket.id + "/analyze", "POST", { version: ticket.version });
  ({ ticket } = await get(ticket.id));
  for (const restored of [false, "true", 1]) {
    assert.equal(
      (
        await call("/" + ticket.id + "/handover", "POST", {
          version: ticket.version,
          analysisId: ticket.analysis_id,
          status: "Resolved",
          note: "Lab restored",
          restored,
        })
      ).status,
      400,
    );
  }
  assert.equal(
    (
      await call("/" + ticket.id + "/handover", "POST", {
        version: ticket.version,
        analysisId: ticket.analysis_id,
        status: "Resolved",
        note: " ",
        restored: true,
      })
    ).status,
    400,
  );
  assert.equal(
    (
      await call("/" + ticket.id + "/handover", "POST", {
        version: ticket.version,
        analysisId: ticket.analysis_id,
        status: "Resolved",
        note: "Lab user validated printing.",
        restored: true,
      })
    ).status,
    200,
  );
  let record = await get(ticket.id);
  assert.equal(record.ticket.status, "Resolved");
  assert.match(record.audit[0].detail, /restoration confirmed/);
  assert.equal(
    (
      await call("/" + ticket.id + "/analyze", "POST", {
        version: record.ticket.version,
      })
    ).status,
    409,
  );
});
test("D1 records and audit survive a Worker restart", async () => {
  const before = await get("INC-1044");
  await mf.dispose();
  mf = start();
  db = await mf.getD1Database("DB");
  assert.deepEqual(await get("INC-1044"), before);
  await assert.rejects(db.prepare("UPDATE audit SET actor='changed'").run());
  await assert.rejects(db.prepare("DELETE FROM audit").run());
});
test("unknown, multi-domain and security incidents require manual review with no action", async () => {
  for (const [title, description] of [
    ["Lunch request", "Please arrange lunch."],
    ["VPN and printer failure", "Two independent incidents."],
    ["Security incident", "Unexpected MFA prompts and suspicious sign-in."],
  ]) {
    let { ticket } = await get("INC-1041");
    await call("/" + ticket.id, "PATCH", {
      version: ticket.version,
      title,
      description,
      impact: "Low",
      urgency: "Low",
    });
    ({ ticket } = await get(ticket.id));
    await call("/" + ticket.id + "/analyze", "POST", {
      version: ticket.version,
    });
    const a = (await get(ticket.id)).ticket.analysis;
    assert.equal(a.action, null);
    assert.equal(a.escalation, true);
  }
});
test("authorization rejects production, missing flags, forged identities and non-loopback hosts", async () => {
  for (const vars of [
    {},
    { APP_ENV: "local" },
    { APP_ENV: "production", LOCAL_DEV_IDENTITY: "enabled" },
  ]) {
    const runtime = start(vars);
    try {
      assert.equal((await call("", "GET", undefined, {}, runtime)).status, 401);
      assert.equal(
        (
          await call(
            "",
            "GET",
            undefined,
            { "cf-access-jwt-assertion": "forged" },
            runtime,
          )
        ).status,
        401,
      );
      assert.equal(
        (await runtime.dispatchFetch("http://localhost/")).status,
        401,
      );
    } finally {
      await runtime.dispose();
    }
  }
  for (const name of [
    "cf-access-jwt-assertion",
    "cf-access-authenticated-user-email",
    "x-user-email",
  ])
    assert.equal(
      (await call("", "GET", undefined, { [name]: "spoofed" })).status,
      401,
    );
  assert.equal(
    (await call("", "GET", undefined, {}, mf, "https://production.example"))
      .status,
    401,
  );
  assert.equal(
    (await call("", "GET", undefined, {}, mf, "http://attacker.example"))
      .status,
    401,
  );
});
test("mutations reject cross-origin requests, malformed fields and stale writes", async () => {
  const { ticket } = await get();
  const body = { version: ticket.version };
  assert.equal(
    (
      await call("/" + ticket.id + "/analyze", "POST", body, {
        Origin: "https://attacker.example",
      })
    ).status,
    403,
  );
  assert.equal(
    (
      await call("/" + ticket.id + "/analyze", "POST", body, {
        "Content-Type": "text/plain",
      })
    ).status,
    415,
  );
  assert.equal(
    (await call("/" + ticket.id + "/analyze", "POST", { version: 0 })).status,
    409,
  );
  assert.equal(
    (
      await call("/" + ticket.id, "PATCH", {
        ...body,
        title: "test",
        description: "test",
        impact: "Critical",
        urgency: "Low",
      })
    ).status,
    400,
  );
  assert.equal((await call("/INC-9999")).status, 404);
});
