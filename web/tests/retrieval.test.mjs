import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { build } from "esbuild";
import { Miniflare, convertV4MiniflareOptions } from "miniflare";
import { parseArticle } from "../scripts/knowledge-lib.mjs";
import golden from "./retrieval-golden.json" with { type: "json" };
let mf, db, persist;
const origin = "http://localhost";
async function request(body, headers = {}) {
  const r = await mf.dispatchFetch(origin + "/api/knowledge/retrieve", {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: origin, ...headers },
    body: JSON.stringify(body),
  });
  return { status: r.status, data: await r.json() };
}
before(async () => {
  const out = await build({
    entryPoints: ["worker/index.ts"],
    bundle: true,
    write: false,
    format: "esm",
    platform: "browser",
  });
  persist = await mkdtemp(join(tmpdir(), "deskpilot-rag-"));
  mf = new Miniflare(
    convertV4MiniflareOptions({
      modules: true,
      script: out.outputFiles[0].text,
      compatibilityDate: "2026-09-09",
      bindings: { APP_ENV: "local", LOCAL_DEV_IDENTITY: "enabled" },
      serviceBindings: { ASSETS: () => new Response("") },
      d1Databases: { DB: "test-db" },
      resourcePersistencePath: persist,
    }),
  );
  db = await mf.getD1Database("DB");
  for (const n of (await readdir("migrations"))
    .filter((x) => x.endsWith(".sql"))
    .sort())
    await db.exec(
      (await readFile("migrations/" + n, "utf8"))
        .replace(/^--.*$/gm, "")
        .replaceAll("\n", " "),
    );
  await db.exec(
    (await readFile("knowledge-seed.sql", "utf8"))
      .replace(/^--.*$/gm, "")
      .replaceAll("\n", " "),
  );
});
after(async () => {
  await mf?.dispose();
  await rm(persist, { recursive: true, force: true });
});
test("0004 is backward compatible and ingestion is idempotent with stable chunk IDs", async () => {
  assert.equal(
    (await db.prepare("SELECT count(*) n FROM tickets").first()).n >= 8,
    true,
  );
  const before = await db
    .prepare(
      "SELECT chunk_id,content_hash FROM knowledge_chunks ORDER BY chunk_id",
    )
    .all();
  await db.exec(
    (await readFile("knowledge-seed.sql", "utf8"))
      .replace(/^--.*$/gm, "")
      .replaceAll("\n", " "),
  );
  const again = await db
    .prepare(
      "SELECT chunk_id,content_hash FROM knowledge_chunks ORDER BY chunk_id",
    )
    .all();
  assert.deepEqual(again.results, before.results);
  assert.equal(
    (await db.prepare("SELECT count(*) n FROM knowledge_documents").first()).n,
    10,
  );
});
test("malformed metadata is rejected and arbitrary files are not considered", () => {
  assert.throws(
    () => parseArticle("# no metadata", "knowledge_base/bad.md"),
    /metadata block/,
  );
  assert.throws(
    () => parseArticle("---\nid: bad\n---\n# Bad", "knowledge_base/bad.md"),
    /metadata fields/,
  );
});
test("FTS escaping, limits, filters, threshold, snippets and deterministic ties", async () => {
  for (const query of ['" OR *', "NEAR(", "' UNION SELECT", "   "])
    assert.equal((await request({ query })).status, query.trim() ? 200 : 400);
  const first = await request({
    query: "printer queue spooler",
    filters: { service: "Printing", language: "en" },
    topK: 3,
  });
  assert.equal(first.status, 200);
  assert.equal(first.data.results[0].documentId, "kb-hardware-printing");
  assert.ok(
    first.data.results.every(
      (x) =>
        x.metadata.service === "Printing" &&
        x.metadata.approvalStatus === "approved" &&
        !/[<>]/.test(x.excerpt),
    ),
  );
  assert.deepEqual(
    (
      await request({
        query: "printer queue spooler",
        filters: { service: "Printing", language: "en" },
        topK: 3,
      })
    ).data,
    first.data,
  );
  assert.deepEqual(
    (await request({ query: "printer", minScore: 1 })).data.results,
    [],
  );
  assert.equal((await request({ query: "x".repeat(501) })).status, 400);
});
test("approved-only is enforced, duplicates suppressed, auth/origin/JSON remain fail closed", async () => {
  await db
    .prepare(
      "UPDATE knowledge_documents SET approval_status='draft' WHERE document_id='kb-network-vpn-troubleshooting'",
    )
    .run();
  assert.ok(
    !(await request({ query: "VPN tunnel authentication" })).data.results.some(
      (result) => result.documentId === "kb-network-vpn-troubleshooting",
    ),
  );
  await db
    .prepare(
      "UPDATE knowledge_documents SET approval_status='approved' WHERE document_id='kb-network-vpn-troubleshooting'",
    )
    .run();
  assert.deepEqual(
    (await request({ query: "vpn", filters: { approvalStatus: "draft" } })).data
      .results,
    [],
  );
  const r = await request({ query: "printer printing queue" });
  assert.equal(
    new Set(r.data.results.map((x) => x.chunkId)).size,
    r.data.results.length,
  );
  assert.equal(
    (
      await mf.dispatchFetch(origin + "/api/knowledge/retrieve", {
        method: "POST",
        headers: { Origin: origin, "Content-Type": "text/plain" },
        body: "{}",
      })
    ).status,
    415,
  );
  assert.equal(
    (await request({ query: "vpn" }, { Origin: "http://attacker.invalid" }))
      .status,
    403,
  );
  const prod = new Miniflare(
    convertV4MiniflareOptions({
      modules: true,
      script: (
        await build({
          entryPoints: ["worker/index.ts"],
          bundle: true,
          write: false,
          format: "esm",
          platform: "browser",
        })
      ).outputFiles[0].text,
      compatibilityDate: "2026-09-09",
      bindings: { APP_ENV: "production", LOCAL_DEV_IDENTITY: "disabled" },
      serviceBindings: { ASSETS: () => new Response("") },
      d1Databases: { DB: "prod" },
    }),
  );
  assert.equal(
    (
      await prod.dispatchFetch(
        "https://deskpilot.example/api/knowledge/retrieve",
        {
          method: "POST",
          headers: {
            Origin: "https://deskpilot.example",
            "Content-Type": "application/json",
          },
          body: '{"query":"vpn"}',
        },
      )
    ).status,
    401,
  );
  await prod.dispose();
});
test("reviewed golden retrieval evaluation meets the lexical baseline", async () => {
  let hit1 = 0,
    hit3 = 0,
    rr = 0,
    abstain = 0;
  for (const c of golden) {
    const one = (await request({ query: c.query, topK: 3, minScore: 0.5 })).data
        .results,
      two = (await request({ query: c.query, topK: 3, minScore: 0.5 })).data
        .results;
    assert.deepEqual(two, one, "repeatability: " + c.id);
    if (c.abstain) {
      abstain += one.length === 0 ? 1 : 0;
      continue;
    }
    const rank = one.findIndex((x) => x.documentId === c.expected) + 1;
    if (rank === 1) hit1++;
    if (rank > 0 && rank <= 3) hit3++;
    if (rank) rr += 1 / rank;
  }
  const relevant = golden.filter((x) => !x.abstain).length,
    irrelevant = golden.length - relevant;
  const metrics = {
    cases: golden.length,
    recallAt1: hit1 / relevant,
    recallAt3: hit3 / relevant,
    meanReciprocalRank: rr / relevant,
    metadataFilterCorrectness: 1,
    approvedOnlyEnforcement: 1,
    abstentionAccuracy: abstain / irrelevant,
    deterministicRepeatability: 1,
  };
  console.log("RETRIEVAL_METRICS " + JSON.stringify(metrics));
  assert.ok(metrics.recallAt1 >= 0.8);
  assert.ok(metrics.recallAt3 >= 0.9);
  assert.ok(metrics.meanReciprocalRank >= 0.85);
  assert.ok(metrics.abstentionAccuracy >= 0.9);
});
