import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHmac } from "node:crypto";
import { build } from "esbuild";
import { Miniflare, convertV4MiniflareOptions } from "miniflare";
let mf, db, script, persist;
const start = () =>
  new Miniflare(
    convertV4MiniflareOptions({
      modules: true,
      script,
      compatibilityDate: "2026-09-09",
      bindings: { APP_ENV: "local", LOCAL_DEV_IDENTITY: "enabled" },
      serviceBindings: { ASSETS: () => new Response("shell") },
      d1Databases: { DB: "operational" },
      resourcePersistencePath: persist,
    }),
  );
const query = async (path, method = "GET", body, headers = {}) => {
  const response = await mf.dispatchFetch("http://localhost/api" + path, {
    method,
    headers: {
      ...(body
        ? { "Content-Type": "application/json", Origin: "http://localhost" }
        : {}),
      ...headers,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  return {
    status: response.status,
    data: await response.json(),
    headers: response.headers,
  };
};
const migrate = async (database, name) =>
  database.exec(
    (await readFile("migrations/" + name, "utf8"))
      .replace(/^\s*--.*$/gm, "")
      .replaceAll("\n", " "),
  );
before(async () => {
  script = (
    await build({
      entryPoints: ["worker/index.ts"],
      bundle: true,
      write: false,
      format: "esm",
      platform: "browser",
    })
  ).outputFiles[0].text;
  persist = await mkdtemp(join(tmpdir(), "deskpilot-operational-"));
  mf = start();
  db = await mf.getD1Database("DB");
  for (const name of (await readdir("migrations"))
    .filter((n) => n.endsWith(".sql"))
    .sort())
    await migrate(db, name);
});
after(async () => {
  await mf?.dispose();
  await rm(persist, { recursive: true, force: true });
});
const insertTicket = (id) =>
  db
    .prepare(
      "INSERT INTO tickets(id,title,description,requester,impact,urgency) VALUES(?,'VPN failure','VPN unavailable','Lab','Low','Low')",
    )
    .bind(id)
    .run();

test("queue pages preserve legacy order and membership during inserts and updates", async () => {
  for (let i = 0; i < 27; i++)
    await insertTicket("INC-800" + String(i).padStart(2, "0"));
  const expected = (
    await db.prepare("SELECT id FROM tickets ORDER BY id").all()
  ).results.map((r) => r.id);
  const first = await query("/tickets/page?limit=3");
  assert.equal(first.status, 200);
  assert.equal(first.data.items.length, 3);
  const legacy = await query("/tickets?limit=3");
  assert.deepEqual(legacy.data, first.data.items);
  assert.ok(legacy.headers.get("X-Next-Cursor"));
  await insertTicket("INC-100");
  await insertTicket("INC-99999");
  await db
    .prepare(
      "UPDATE tickets SET status='Escalated',version=version+1 WHERE id=?",
    )
    .bind(expected[4])
    .run();
  let items = [...first.data.items],
    cursor = first.data.nextCursor;
  while (cursor) {
    const result = await query("/tickets/page?cursor=" + cursor);
    assert.equal(result.status, 200);
    items.push(...result.data.items);
    cursor = result.data.nextCursor;
  }
  assert.deepEqual(
    items.map((r) => r.id),
    expected,
  );
  assert.equal(new Set(items.map((r) => r.id)).size, items.length);
  assert.deepEqual(
    (await query("/tickets/page?cursor=" + first.data.nextCursor)).data,
    (await query("/tickets/page?cursor=" + first.data.nextCursor)).data,
  );
  assert.equal((await query("/tickets/page")).data.items.length, 20);
  assert.ok((await query("/tickets/page?limit=50")).data.items.length <= 50);
});

test("cursor validation rejects tampering, expiry, endpoint changes and query abuse uniformly", async () => {
  const first = (await query("/tickets/page?limit=1")).data;
  const cursor = first.nextCursor;
  const invalid = [
    "limit=-1",
    "limit=0",
    "limit=51",
    "limit=99999999",
    "limit=1.5",
    "limit=01",
    "limit=",
    "limit=2&limit=2",
    "filter=x",
    "actor=admin",
    "cursor=",
    "cursor=x",
    "cursor=" + "A".repeat(2048),
    "cursor=" + cursor + "&limit=2",
    "cursor=" + cursor + "&cursor=" + cursor,
  ];
  const [payload, signature] = cursor.split(".");
  const changed = JSON.parse(Buffer.from(payload, "base64url"));
  changed.high++;
  invalid.push(
    "cursor=" +
      Buffer.from(JSON.stringify(changed)).toString("base64url") +
      "." +
      signature,
  );
  const { secret } = await db
    .prepare("SELECT secret FROM pagination_key WHERE id=1")
    .first();
  const signed = (fields) => {
    const p = Buffer.from(JSON.stringify(fields)).toString("base64url");
    return (
      p +
      "." +
      createHmac("sha256", Buffer.from(secret, "hex"))
        .update(p)
        .digest("base64url")
    );
  };
  const valid = JSON.parse(Buffer.from(payload, "base64url"));
  for (const fields of [
    { ...valid, expires: 1 },
    { ...valid, expires: Math.floor(Date.now() / 1000) + 7200 },
    { ...valid, last: 123 },
    { ...valid, high: -1 },
    { ...valid, actor: "other" },
    { ...valid, extra: true },
    { ...valid, limit: 0 },
  ])
    invalid.push("cursor=" + signed(fields));
  for (const suffix of invalid) {
    const result = await query("/tickets/page?" + suffix);
    assert.equal(result.status, 400, suffix);
    assert.deepEqual(result.data, { error: "Invalid pagination request." });
  }
  for (const route of ["/tickets/INC-1042/audit", "/tickets/INC-1042/analyses"])
    assert.equal((await query(route + "?cursor=" + cursor)).status, 400);
  assert.equal(
    (await query("/tickets/page", "GET", undefined, { "x-user-id": "admin" }))
      .status,
    401,
  );
});

test("analyses are atomic versioned immutable snapshots with preserved evidence and restart persistence", async () => {
  const id = "INC-81000";
  await insertTicket(id);
  assert.deepEqual((await query("/tickets/" + id + "/analyses")).data, {
    items: [],
    nextCursor: null,
  });
  const analyze = async (version) =>
    query("/tickets/" + id + "/analyze", "POST", {
      version,
      actor: "attacker",
      created_at: "1900-01-01",
    });
  const concurrent = await Promise.all([analyze(1), analyze(1)]);
  assert.deepEqual(concurrent.map((r) => r.status).sort(), [200, 409]);
  let record = (await query("/tickets/" + id)).data;
  let snapshot = (await query("/tickets/" + id + "/analyses")).data.items[0];
  assert.equal(snapshot.actor, "local-lab-technician");
  assert.equal(snapshot.incident_version, 2);
  assert.equal(snapshot.schema_version, 1);
  assert.equal(snapshot.analysis_id, record.ticket.analysis_id);
  assert.deepEqual(snapshot.analysis, record.ticket.analysis);
  assert.deepEqual(snapshot.evidence, record.ticket.analysis.evidence);
  assert.ok(Date.parse(snapshot.created_at) > Date.now() - 60000);
  assert.match(snapshot.analysis.response, /not yet been confirmed/);
  assert.equal(
    (
      await db
        .prepare("SELECT COUNT(*) n FROM analysis_history WHERE ticket_id=?")
        .bind(id)
        .first()
    ).n,
    1,
  );
  for (let i = 0; i < 23; i++) {
    record = (await query("/tickets/" + id)).data;
    assert.equal((await analyze(record.ticket.version)).status, 200);
  }
  const first = (await query("/tickets/" + id + "/analyses?limit=2")).data;
  const auditFirst = (await query("/tickets/" + id + "/audit?limit=2")).data;
  const expected = (
    await db
      .prepare(
        "SELECT id FROM analysis_history WHERE ticket_id=? ORDER BY id DESC",
      )
      .bind(id)
      .all()
  ).results.map((r) => r.id);
  record = (await query("/tickets/" + id)).data;
  await analyze(record.ticket.version);
  let all = [...first.items],
    cursor = first.nextCursor;
  while (cursor) {
    const page = (await query("/tickets/" + id + "/analyses?cursor=" + cursor))
      .data;
    all.push(...page.items);
    cursor = page.nextCursor;
  }
  assert.deepEqual(
    all.map((r) => r.id),
    expected,
  );
  assert.deepEqual(all.at(-1), snapshot);
  assert.equal(
    (await query("/tickets/" + id + "/audit?cursor=" + first.nextCursor))
      .status,
    400,
  );
  assert.equal(
    (await query("/tickets/INC-1042/analyses?cursor=" + first.nextCursor))
      .status,
    400,
  );
  let audits = [...auditFirst.items];
  cursor = auditFirst.nextCursor;
  while (cursor) {
    const page = (await query("/tickets/" + id + "/audit?cursor=" + cursor))
      .data;
    audits.push(...page.items);
    cursor = page.nextCursor;
  }
  assert.equal(audits.length, 24);
  assert.equal(new Set(audits.map((r) => r.id)).size, 24);
  record = (await query("/tickets/" + id)).data;
  assert.equal(record.audit.length, 20);
  assert.ok(record.auditNextCursor);
  await query("/tickets/" + id, "PATCH", {
    ...record.ticket,
    description: "Edited symptoms",
  });
  assert.equal((await query("/tickets/" + id)).data.ticket.analysis, null);
  assert.deepEqual(
    (await query("/tickets/" + id + "/analyses?limit=50")).data.items.at(-1),
    snapshot,
  );
  for (const sql of [
    "UPDATE analysis_history SET actor='changed'",
    "DELETE FROM analysis_history",
  ])
    await assert.rejects(db.prepare(sql).run(), /append-only/);
  for (const method of ["POST", "PATCH", "DELETE"])
    assert.ok(
      [403, 405].includes(
        (await query("/tickets/" + id + "/analyses", method, { version: 1 }))
          .status,
      ),
    );
  const before = (await query("/tickets/" + id + "/analyses?limit=50")).data;
  await mf.dispose();
  mf = start();
  db = await mf.getD1Database("DB");
  assert.deepEqual(
    (await query("/tickets/" + id + "/analyses?limit=50")).data,
    before,
  );
  assert.equal(
    (await query("/tickets/" + id + "/analyses?cursor=" + first.nextCursor))
      .status,
    200,
  );
});

test("0006 upgrades representative 0001-0005 data without changing legacy records or FTS", async () => {
  const upgrade = new Miniflare(
    convertV4MiniflareOptions({
      modules: true,
      script,
      compatibilityDate: "2026-09-09",
      d1Databases: { DB: "upgrade" },
    }),
  );
  try {
    const database = await upgrade.getD1Database("DB");
    for (const name of (await readdir("migrations"))
      .filter((n) => /^000[1-5]_.*sql$/.test(n))
      .sort())
      await migrate(database, name);
    await database.exec(
      (await readFile("knowledge-seed.sql", "utf8"))
        .replace(/^\s*--.*$/gm, "")
        .replaceAll("\n", " "),
    );
    await database.exec(
      "UPDATE tickets SET analysis='{\"hypothesis\":\"Legacy hypothesis\"}',analysis_id='legacy-analysis' WHERE id='INC-1042'; INSERT INTO audit(ticket_id,kind,actor,detail) VALUES('INC-1042','analyzed','legacy-actor','Legacy event'); INSERT INTO knowledge_retrieval_events(retrieval_id,actor_hash,retrieval_mode,result_count,filter_count,abstained) VALUES('legacy-retrieval','hash','lexical',1,0,0);",
    );
    await database
      .prepare(
        "INSERT INTO knowledge_feedback(feedback_id,client_event_id,actor_hash,retrieval_id,retrieval_mode,document_id,chunk_id,citation,document_version,document_hash,outcome,reason) VALUES('legacy-feedback','event','hash','legacy-retrieval','lexical','doc','chunk','citation','1','hash','helpful','clear')",
      )
      .run();
    const tables = [
      "tickets",
      "audit",
      "knowledge_documents",
      "knowledge_chunks",
      "knowledge_retrieval_events",
      "knowledge_retrieval_items",
      "knowledge_feedback",
    ];
    const baseline = {};
    for (const table of tables)
      baseline[table] = (
        await database.prepare("SELECT * FROM " + table).all()
      ).results;
    const ftsBefore = (
      await database
        .prepare(
          "SELECT rowid FROM knowledge_fts WHERE knowledge_fts MATCH 'vpn'",
        )
        .all()
    ).results;
    await migrate(database, "0006_operational_maturity.sql");
    for (const table of tables)
      assert.deepEqual(
        (await database.prepare("SELECT * FROM " + table).all()).results,
        baseline[table],
        table,
      );
    assert.deepEqual(
      (
        await database
          .prepare(
            "SELECT rowid FROM knowledge_fts WHERE knowledge_fts MATCH 'vpn'",
          )
          .all()
      ).results,
      ftsBefore,
    );
    assert.equal(
      (
        await database
          .prepare("SELECT COUNT(*) n FROM analysis_history")
          .first()
      ).n,
      0,
    );
    assert.equal(
      (
        await database
          .prepare("SELECT length(secret) n FROM pagination_key")
          .first()
      ).n,
      64,
    );
  } finally {
    await upgrade.dispose();
  }
});
test("snapshot failure rolls back ticket update and audit atomically", async () => {
  const id = "INC-82000";
  await insertTicket(id);
  await db.exec(
    "CREATE TRIGGER reject_test_snapshot BEFORE INSERT ON analysis_history WHEN NEW.ticket_id='INC-82000' BEGIN SELECT RAISE(ABORT,'Synthetic failure'); END;",
  );
  try {
    const result = await query("/tickets/" + id + "/analyze", "POST", {
      version: 1,
    });
    assert.equal(result.status, 500);
    assert.deepEqual(result.data, {
      error: "The request could not be completed. Retry safely.",
    });
    const record = (await query("/tickets/" + id)).data;
    assert.equal(record.ticket.version, 1);
    assert.equal(record.ticket.analysis, null);
    assert.equal(record.audit.length, 0);
    assert.equal(
      (await query("/tickets/" + id + "/analyses")).data.items.length,
      0,
    );
  } finally {
    await db.exec("DROP TRIGGER reject_test_snapshot");
  }
  assert.equal(
    (await query("/tickets/" + id + "/analyze", "POST", { version: 1 })).status,
    200,
  );
});
