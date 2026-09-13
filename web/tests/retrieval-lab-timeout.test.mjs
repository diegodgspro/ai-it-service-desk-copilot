import assert from "node:assert/strict";
import test from "node:test";
import {
  HybridRetriever,
  LexicalLabRetriever,
  SemanticRetriever,
  retrieveWithFallback,
} from "../scripts/retrieval-lab-core.mjs";

const metadata = {
  documentId: "kb-timeout-fixture",
  title: "VPN timeout fixture",
  sourceType: "runbook",
  service: "Network",
  category: "Access",
  product: "VPN",
  language: "en",
  approvalStatus: "approved",
  version: "1.0",
  lastReviewed: "2026-09-01",
  tags: ["fixture"],
  classification: "synthetic-demo",
};
const corpus = {
  documents: [metadata],
  chunks: [{
    chunkId: "kb-timeout-fixture-01",
    documentId: metadata.documentId,
    heading: "Authentication",
    content: "VPN authentication troubleshooting",
  }],
};

test("provider timeout fails safely to lexical without hanging", async () => {
  const lexical = new LexicalLabRetriever(corpus);
  const semantic = new SemanticRetriever(corpus, {
    id: "never-resolves",
    embed: () => new Promise(() => {}),
  });
  const started = performance.now();
  const actual = await retrieveWithFallback({
    enabled: true,
    mode: "semantic",
    lexical,
    semantic,
    query: { query: "VPN authentication" },
    timeoutMs: 10,
  });
  assert.equal(actual.method, "lexical");
  assert.equal(actual.fallback, true);
  assert.ok(performance.now() - started < 1000);
});

test("provider resolving after the deadline cannot replace lexical fallback", async () => {
  const lexical = new LexicalLabRetriever(corpus);
  const semantic = new SemanticRetriever(corpus, {
    id: "late",
    embed: () => new Promise((resolve) => setTimeout(() => resolve([Array(384).fill(1)]), 50)),
  });
  const actual = await retrieveWithFallback({
    enabled: true, mode: "semantic", lexical, semantic,
    query: { query: "VPN authentication" }, timeoutMs: 5,
  });
  assert.equal(actual.method, "lexical");
  await new Promise((resolve) => setTimeout(resolve, 75));
  assert.equal(semantic.index, null);
  assert.equal(actual.results[0].documentId, metadata.documentId);
});

test("late provider rejection is handled without an unhandled rejection", async () => {
  const lexical = new LexicalLabRetriever(corpus);
  const semantic = new SemanticRetriever(corpus, {
    id: "late-rejection",
    embed: () => new Promise((_, reject) => setTimeout(() => reject(new Error("late")), 30)),
  });
  let unhandled;
  const listener = (reason) => { unhandled = reason; };
  process.once("unhandledRejection", listener);
  try {
    const actual = await retrieveWithFallback({
      enabled: true, mode: "semantic", lexical, semantic,
      query: { query: "VPN authentication" }, timeoutMs: 5,
    });
    assert.equal(actual.method, "lexical");
    await new Promise((resolve) => setTimeout(resolve, 50));
    assert.equal(unhandled, undefined);
  } finally {
    process.removeListener("unhandledRejection", listener);
  }
});

test("hybrid falls back to the same canonical lexical result", async () => {
  const lexical = new LexicalLabRetriever(corpus);
  const expected = await lexical.retrieve({ query: "VPN authentication", topK: 3 });
  const semantic = new SemanticRetriever(corpus, { id: "reject", embed: async () => { throw new Error("offline"); } });
  const hybrid = new HybridRetriever(lexical, semantic);
  const actual = await retrieveWithFallback({
    enabled: true, mode: "hybrid", lexical, semantic, hybrid,
    query: { query: "VPN authentication", topK: 3 }, timeoutMs: 20,
  });
  assert.deepEqual(actual.results, expected);
  assert.equal(actual.fallback, true);
});

test("hybrid lexical authorization and validation failures remain failures and are not retried", async () => {
  for (const message of ["unauthorized", "invalid request"]) {
    let calls = 0;
    const lexical = { retrieve: async () => { calls++; throw new Error(message); } };
    const semantic = { retrieve: async () => [] };
    const hybrid = new HybridRetriever(lexical, semantic);
    await assert.rejects(() => retrieveWithFallback({
      enabled: true, mode: "hybrid", lexical, semantic, hybrid,
      query: { query: "VPN" }, timeoutMs: 20,
    }), new RegExp(message));
    assert.equal(calls, 1);
  }
});

test("unknown semantic mode fails safely to lexical", async () => {
  const lexical = new LexicalLabRetriever(corpus);
  const actual = await retrieveWithFallback({
    enabled: true,
    mode: "unexpected-provider",
    lexical,
    query: { query: "VPN authentication" },
  });
  assert.equal(actual.method, "lexical");
  assert.equal(actual.fallback, true);
});
