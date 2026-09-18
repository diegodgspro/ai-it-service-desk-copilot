import test from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { createHash } from "node:crypto";
import { Miniflare, convertV4MiniflareOptions } from "miniflare";
const sql = async (db) => {
  for (const name of (await readdir("migrations"))
    .filter((x) => x.endsWith(".sql"))
    .sort())
    await db.exec(
      (await readFile("migrations/" + name, "utf8"))
        .replace(/^\s*--.*$/gm, "")
        .replaceAll("\n", " "),
    );
  await db.exec(
    (await readFile("knowledge-seed.sql", "utf8"))
      .replace(/^\s*--.*$/gm, "")
      .replaceAll("\n", " "),
  );
};
const fixture = async () =>
  JSON.parse(
    await readFile("tests/fixtures/recovery-export-v1.synthetic.json", "utf8"),
  );
const validateFixture = (f) => {
  assert.deepEqual(
    [f.format, f.version, f.classification],
    ["deskpilot-recovery-fixture", 1, "synthetic-only"],
  );
  assert.deepEqual(Object.keys(f).sort(), [
    "analysis",
    "audit",
    "classification",
    "feedback",
    "format",
    "item",
    "retrieval",
    "ticket",
    "version",
  ]);
};
async function rehearse(name) {
  const mf = new Miniflare(
    convertV4MiniflareOptions({
      modules: true,
      script: "export default {fetch(){return new Response('local')}}",
      compatibilityDate: "2026-09-09",
      d1Databases: { DB: name },
    }),
  );
  try {
    const db = await mf.getD1Database("DB");
    await sql(db);
    const f = await fixture();
    validateFixture(f);
    const t = f.ticket;
    await db
      .prepare(
        "INSERT INTO tickets(id,title,description,requester,impact,urgency) VALUES(?,?,?,?,?,?)",
      )
      .bind(t.id, t.title, t.description, t.requester, t.impact, t.urgency)
      .run();
    const a = f.audit;
    await db
      .prepare("INSERT INTO audit(ticket_id,kind,actor,detail) VALUES(?,?,?,?)")
      .bind(a.ticket_id, a.kind, a.actor, a.detail)
      .run();
    const h = f.analysis;
    await db
      .prepare(
        "INSERT INTO analysis_history(analysis_id,ticket_id,incident_version,actor,analysis_json,evidence_json) VALUES(?,?,?,?,?,?)",
      )
      .bind(
        h.analysis_id,
        h.ticket_id,
        h.incident_version,
        h.actor,
        h.analysis_json,
        h.evidence_json,
      )
      .run();
    await db
      .prepare("UPDATE tickets SET version=2 WHERE id=?")
      .bind(t.id)
      .run();
    const r = f.retrieval;
    await db
      .prepare(
        "INSERT INTO knowledge_retrieval_events(retrieval_id,actor_hash,retrieval_mode,result_count,filter_count,abstained) VALUES(?,?,?,?,?,?)",
      )
      .bind(
        r.retrieval_id,
        r.actor_hash,
        r.retrieval_mode,
        r.result_count,
        r.filter_count,
        r.abstained,
      )
      .run();
    const i = f.item;
    await db
      .prepare(
        "INSERT INTO knowledge_retrieval_items(retrieval_id,document_id,chunk_id) VALUES(?,?,?)",
      )
      .bind(i.retrieval_id, i.document_id, i.chunk_id)
      .run();
    const k = f.feedback;
    await db
      .prepare(
        "INSERT INTO knowledge_feedback(feedback_id,client_event_id,actor_hash,retrieval_id,retrieval_mode,document_id,chunk_id,citation,document_version,document_hash,outcome,reason) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)",
      )
      .bind(
        k.feedback_id,
        k.client_event_id,
        k.actor_hash,
        k.retrieval_id,
        k.retrieval_mode,
        k.document_id,
        k.chunk_id,
        k.citation,
        k.document_version,
        k.document_hash,
        k.outcome,
        k.reason,
      )
      .run();
    await db.exec(
      "DELETE FROM knowledge_fts; INSERT INTO knowledge_fts(rowid,title,heading,content) SELECT c.chunk_pk,d.title,c.heading,c.content FROM knowledge_chunks c JOIN knowledge_documents d ON d.document_id=c.document_id;",
    );
    const expected = {
      tickets: 9,
      audit: 1,
      analysis_history: 1,
      knowledge_documents: 10,
      knowledge_chunks: 46,
      knowledge_fts: 46,
      knowledge_retrieval_events: 1,
      knowledge_retrieval_items: 1,
      knowledge_feedback: 1,
    };
    for (const [table, n] of Object.entries(expected))
      assert.equal(
        (await db.prepare(`SELECT COUNT(*) n FROM ${table}`).first()).n,
        n,
        table,
      );
    assert.equal(
      (
        await db
          .prepare(
            "SELECT COUNT(*) n FROM knowledge_retrieval_items i LEFT JOIN knowledge_retrieval_events e ON e.retrieval_id=i.retrieval_id LEFT JOIN knowledge_chunks c ON c.chunk_id=i.chunk_id WHERE e.retrieval_id IS NULL OR c.chunk_id IS NULL",
          )
          .first()
      ).n,
      0,
    );
    for (const [table, key] of [
      ["audit", "id"],
      ["analysis_history", "id"],
      ["knowledge_retrieval_events", "retrieval_id"],
      ["knowledge_retrieval_items", "retrieval_id"],
      ["knowledge_feedback", "feedback_id"],
    ])
      await assert.rejects(
        db.prepare(`DELETE FROM ${table} WHERE ${key} IS NOT NULL`).run(),
        /append-only/,
      );
    const tables = Object.keys(expected).filter((x) => x !== "knowledge_fts"),
      logical = {};
    for (const table of tables)
      logical[table] = (
        await db.prepare(`SELECT * FROM ${table} ORDER BY 1`).all()
      ).results;
    return createHash("sha256")
      .update(
        JSON.stringify(logical, (key, value) =>
          ["created_at", "ingested_at"].includes(key)
            ? "<database-time>"
            : value,
        ),
      )
      .digest("hex");
  } finally {
    await mf.dispose();
  }
}
test("isolated recovery is complete, append-only and deterministic", async () =>
  assert.equal(await rehearse("recovery-a"), await rehearse("recovery-b")));
test("recovery rejects incompatible or malformed fixtures", async () => {
  const f = await fixture();
  for (const bad of [
    { ...f, version: 2 },
    { ...f, classification: "private-production" },
    { ...f, secret: "forbidden" },
  ])
    assert.throws(() => validateFixture(bad));
  assert.throws(() => JSON.parse('{"format":'));
});
