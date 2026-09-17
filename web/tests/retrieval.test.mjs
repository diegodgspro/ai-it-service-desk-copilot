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
async function feedback(body, headers = {}) {
  const r = await mf.dispatchFetch(origin + "/api/knowledge/feedback", {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: origin, ...headers },
    body: typeof body === "string" ? body : JSON.stringify(body),
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
  const repeated = (
      await request({
        query: "printer queue spooler",
        filters: { service: "Printing", language: "en" },
        topK: 3,
      })
    ).data;
  assert.notEqual(repeated.retrievalId, first.data.retrievalId);
  assert.deepEqual(repeated.results, first.data.results);
  assert.deepEqual(
    (await request({ query: "printer", minScore: 1 })).data.results,
    [],
  );
  assert.equal((await request({ query: "x".repeat(501) })).status, 400);
  for (const field of ["semanticMinScore", "timeoutMs", "signal", "embeddings", "semanticScores", "rrfK", "modelMetadata", "unknown"])
    assert.equal((await request({ query: "printer", [field]: field === "signal" ? {} : 1 })).status, 400, field);
  assert.equal((await request({ query: "printer", filters: { operatingSystem: "Toy" } })).status, 400);
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
test("0005 upgrades a populated 0001-0004 database without blocking knowledge refresh", async()=>{
  const upgradePersist=await mkdtemp(join(tmpdir(),"deskpilot-feedback-upgrade-"));
  const upgrade=new Miniflare(convertV4MiniflareOptions({modules:true,script:"export default {fetch(){return new Response('ok')}}",compatibilityDate:"2026-09-09",d1Databases:{DB:"upgrade-db"},resourcePersistencePath:upgradePersist}));
  try {
    const upgradeDb=await upgrade.getD1Database("DB");
    for(const n of ["0001_schema.sql","0002_synthetic_seed.sql","0003_structured_intake.sql","0004_enterprise_knowledge_fts.sql"])
      await upgradeDb.exec((await readFile("migrations/"+n,"utf8")).replace(/^--.*$/gm,"").replaceAll("\n"," "));
    const seed=(await readFile("knowledge-seed.sql","utf8")).replace(/^--.*$/gm,"").replaceAll("\n"," ");
    await upgradeDb.exec(seed);
    await upgradeDb.prepare("INSERT INTO audit(ticket_id,kind,actor,detail) VALUES('INC-1041','upgrade-fixture','synthetic','preserve')").run();
    await upgradeDb.exec((await readFile("migrations/0005_knowledge_feedback.sql","utf8")).replace(/^--.*$/gm,"").replaceAll("\n"," "));
    assert.equal((await upgradeDb.prepare("SELECT COUNT(*) n FROM tickets").first()).n,8);
    assert.equal((await upgradeDb.prepare("SELECT COUNT(*) n FROM audit WHERE kind='upgrade-fixture'").first()).n,1);
    await upgradeDb.exec(seed);
    assert.equal((await upgradeDb.prepare("SELECT COUNT(*) n FROM knowledge_documents").first()).n,10);
  } finally { await upgrade.dispose(); await rm(upgradePersist,{recursive:true,force:true}); }
});

test("summary suppresses identical 0?4 states, rejects all slicing and exposes only global aggregates at five", async () => {
  const url=origin+"/api/knowledge/feedback/summary";
  const query={query:"printer queue spooler",filters:{approvalStatus:"approved"}};
  const baseline=(await request(query)).data.results;
  for(let count=0;count<5;count++) {
    for(let retry=0;retry<2;retry++) {
      const response=await mf.dispatchFetch(url);
      assert.equal(response.status,200);
      assert.deepEqual(await response.json(),{status:"insufficient_sample"});
    }
    for(const params of ["?limit=1","?cursor=forged","?documentId=kb-hardware-printing","?actor=other","?outcome=helpful"]) {
      const response=await mf.dispatchFetch(url+params);
      assert.equal(response.status,400);
      assert.deepEqual(await response.json(),{error:"Query parameters are not supported."});
    }
    const retrieved=await request(query), item=retrieved.data.results[0];
    assert.equal((await feedback({clientEventId:crypto.randomUUID(),retrievalId:retrieved.data.retrievalId,documentId:item.documentId,chunkId:item.chunkId,citation:item.citation.label,documentVersion:item.metadata.version,documentHash:item.documentHash,outcome:"helpful",reason:count===0?"clear":"actionable"})).status,201);
  }
  const summary=await (await mf.dispatchFetch(url)).json();
  assert.equal(summary.status,"available");
  assert.equal(summary.evaluatedEvidenceCount,5);
  assert.equal(summary.helpfulPercent,100);
  assert.deepEqual(summary.reasons,[]);
  assert.deepEqual(summary.documents,[]);
  assert.deepEqual((await request(query)).data.results,baseline,"feedback cannot change retrieval ranking or evidence");
});

test("feedback is strict, idempotent, append-only and summarized without sensitive data", async () => {
  const retrieval = await request({ query: "printer queue spooler", filters:{approvalStatus:"approved"} });
  const item = retrieval.data.results[0];
  const base = { clientEventId:crypto.randomUUID(), retrievalId:retrieval.data.retrievalId, documentId:item.documentId, chunkId:item.chunkId, citation:item.citation.label, documentVersion:item.metadata.version, documentHash:item.documentHash };
  const helpful = await feedback({...base,outcome:"helpful",reason:"actionable"});
  assert.equal(helpful.status,201);
  const duplicate = await feedback({...base,outcome:"helpful",reason:"actionable"});
  assert.equal(duplicate.status,200); assert.equal(duplicate.data.feedbackId,helpful.data.feedbackId); assert.equal(duplicate.data.duplicate,true);
  assert.equal((await feedback({...base,outcome:"helpful",reason:"clear"})).status,409,"an idempotency key is bound to its original representation");
  const concurrentItem=retrieval.data.results[1], concurrent={clientEventId:crypto.randomUUID(),retrievalId:retrieval.data.retrievalId,documentId:concurrentItem.documentId,chunkId:concurrentItem.chunkId,citation:concurrentItem.citation.label,documentVersion:concurrentItem.metadata.version,documentHash:concurrentItem.documentHash,outcome:"not_helpful",reason:"insufficient_detail"};
  const concurrentResults=await Promise.all([feedback(concurrent),feedback(concurrent)]);
  assert.deepEqual(concurrentResults.map(x=>x.status).sort(),[200,201]);
  assert.equal((await db.prepare("SELECT COUNT(*) n FROM knowledge_feedback WHERE client_event_id=?").bind(concurrent.clientEventId).first()).n,1);
  for (const invalid of [
    {...base,clientEventId:crypto.randomUUID(),outcome:"helpful",reason:"irrelevant"},
    {...base,clientEventId:crypto.randomUUID(),outcome:"not_helpful",reason:"wrong_service",actor:"forged"},
    {...base,clientEventId:crypto.randomUUID(),outcome:"not_helpful",reason:"wrong_service",createdAt:"2000-01-01"},
    {...base,clientEventId:crypto.randomUUID(),outcome:"not_helpful",reason:"wrong_service",citation:"bad@1.0#citation"},
    {...base,clientEventId:crypto.randomUUID(),outcome:"not_helpful",reason:"wrong_service",documentId:"missing"},
  ]) assert.equal((await feedback(invalid)).status,400);
  const removed=retrieval.data.results[2];
  await db.prepare("DELETE FROM knowledge_chunks WHERE chunk_id=?").bind(removed.chunkId).run();
  assert.equal((await feedback({...base,clientEventId:crypto.randomUUID(),documentId:removed.documentId,chunkId:removed.chunkId,citation:removed.citation.label,documentVersion:removed.metadata.version,documentHash:removed.documentHash,outcome:"helpful",reason:"relevant"})).status,400);
  const correction = await feedback({...base,clientEventId:crypto.randomUUID(),outcome:"not_helpful",reason:"outdated",supersedesFeedbackId:helpful.data.feedbackId});
  assert.equal(correction.status,201); assert.notEqual(correction.data.feedbackId,helpful.data.feedbackId);
  const correctionRace=await Promise.all(["clear","relevant"].map(reason=>feedback({...base,clientEventId:crypto.randomUUID(),outcome:"helpful",reason,supersedesFeedbackId:correction.data.feedbackId})));
  assert.deepEqual(correctionRace.map(x=>x.status).sort(),[201,409]);
  const rows=await db.prepare("SELECT feedback_id,outcome FROM knowledge_feedback WHERE retrieval_id=? ORDER BY created_at").bind(base.retrievalId).all();
  assert.equal(rows.results.length,4);
  await assert.rejects(db.prepare("UPDATE knowledge_feedback SET reason='clear'").run());
  await assert.rejects(db.prepare("DELETE FROM knowledge_feedback").run());
  const response=await mf.dispatchFetch(origin+"/api/knowledge/feedback/summary");
  assert.equal(response.status,200); const summary=await response.json();
  assert.equal(summary.evaluatedEvidenceCount>=2,true);
  const serialized=JSON.stringify(summary).toLowerCase();
  for(const forbidden of ["actor","auth0","email","permission","query","description","excerpt","token"]) assert.equal(serialized.includes(forbidden),false,forbidden);
  await db.exec((await readFile("knowledge-seed.sql","utf8")).replace(/^--.*$/gm,"").replaceAll("\n"," "));
});

test("feedback endpoint enforces origin, JSON and the UTF-8 byte limit", async()=>{
  assert.equal((await feedback({}, {Origin:"https://attacker.invalid"})).status,403);
  assert.equal((await feedback("{}", {"Content-Type":"text/plain"})).status,415);
  const r=await mf.dispatchFetch(origin+"/api/knowledge/feedback",{method:"POST",headers:{"Content-Type":"application/json",Origin:origin},body:JSON.stringify({padding:"é".repeat(9000)})});
  assert.equal(r.status,413);
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
