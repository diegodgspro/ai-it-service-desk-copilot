import assert from "node:assert/strict";
import test from "node:test";
import {
  DIMENSIONS,
  DeterministicEmbeddingProvider,
  HybridRetriever,
  LexicalLabRetriever,
  SemanticRetriever,
  cosineSimilarity,
  normalizeVector,
  reciprocalRankFusion,
  retrieveWithFallback,
} from "../scripts/retrieval-lab-core.mjs";

const document = (documentId, overrides = {}) => ({
  documentId,
  title: `${documentId} title`,
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
  ...overrides,
});
const corpus = {
  documents: [
    document("approved-vpn"),
    document("draft-vpn", { approvalStatus: "draft" }),
    document("approved-printer", {
      service: "Printing",
      category: "Hardware",
      product: "Printer",
      language: "pt-BR",
    }),
  ],
  chunks: [
    {
      chunkId: "approved-vpn-01",
      documentId: "approved-vpn",
      heading: "Remote access",
      content: "VPN tunnel authentication failed <script>alert(1)</script>\u0000",
    },
    {
      chunkId: "approved-vpn-02",
      documentId: "approved-vpn",
      heading: "Duplicate",
      content: "VPN tunnel authentication failed <script>alert(1)</script>\u0000",
    },
    {
      chunkId: "draft-vpn-01",
      documentId: "draft-vpn",
      heading: "Do not return",
      content: "VPN tunnel authentication failed secret draft instructions",
    },
    {
      chunkId: "approved-printer-01",
      documentId: "approved-printer",
      heading: "Fila",
      content: "Impressora com documentos presos na fila de impressão",
    },
  ],
};

test("normalization rejects malformed vectors and cosine rejects dimension mismatch", () => {
  assert.equal(normalizeVector(Array(DIMENSIONS).fill(1)).length, DIMENSIONS);
  for (const vector of [
    Array(DIMENSIONS - 1).fill(1),
    [...Array(DIMENSIONS - 1).fill(1), Number.NaN],
    Array(DIMENSIONS).fill(0),
    "not-a-vector",
  ])
    assert.throws(() => normalizeVector(vector), /invalid embedding/);
  assert.throws(() => cosineSimilarity([1], [1, 2]), /dimension mismatch/);
});

test("provider failure, invalid dimensions, malformed vector and missing provider fall back to lexical", async () => {
  const lexical = new LexicalLabRetriever(corpus);
  const providers = [
    { id: "reject", embed: async () => { throw new Error("offline"); } },
    { id: "wrong-dimensions", embed: async (texts) => texts.map(() => [1]) },
    { id: "nan", embed: async (texts) => texts.map(() => [...Array(DIMENSIONS - 1).fill(0), Number.NaN]) },
    { id: "malformed", embed: async () => ({ vector: [] }) },
  ];
  for (const provider of providers) {
    const semantic = new SemanticRetriever(corpus, provider);
    const actual = await retrieveWithFallback({
      enabled: true,
      mode: "semantic",
      lexical,
      semantic,
      query: { query: "VPN authentication", topK: 3 },
    });
    assert.equal(actual.method, "lexical", provider.id);
    assert.equal(actual.fallback, true, provider.id);
    assert.ok(actual.results.length > 0, provider.id);
  }
  const missing = await retrieveWithFallback({
    enabled: true,
    mode: "semantic",
    lexical,
    query: { query: "VPN authentication" },
  });
  assert.equal(missing.method, "lexical");
  assert.equal(missing.fallback, true);
});

test("disabled semantic mode is production-safe and never invokes the provider", async () => {
  let calls = 0;
  const lexical = new LexicalLabRetriever(corpus);
  const semantic = new SemanticRetriever(corpus, {
    id: "must-not-run",
    embed: async () => { calls++; throw new Error("must not run"); },
  });
  const actual = await retrieveWithFallback({
    enabled: false,
    mode: "semantic",
    lexical,
    semantic,
    query: { query: "VPN authentication" },
  });
  assert.equal(actual.method, "lexical");
  assert.equal(actual.fallback, false);
  assert.equal(calls, 0);
});

test("approved-only, metadata and language filters survive semantic and hybrid ranking", async () => {
  const lexical = new LexicalLabRetriever(corpus);
  const semantic = new SemanticRetriever(
    corpus,
    new DeterministicEmbeddingProvider(),
    { minScore: -1 },
  );
  const hybrid = new HybridRetriever(lexical, semantic);
  for (const retriever of [semantic, hybrid]) {
    const results = await retriever.retrieve({
      query: "printer queue VPN",
      filters: { service: "Printing", language: "pt-BR" },
      topK: 10,
      minScore: 0,
      semanticMinScore: -1,
    });
    assert.ok(results.length > 0);
    assert.ok(results.every((result) =>
      result.metadata.approvalStatus === "approved" &&
      result.metadata.service === "Printing" &&
      result.metadata.language === "pt-BR"));
    assert.deepEqual(
      await retriever.retrieve({
        query: "VPN",
        filters: { approvalStatus: "draft" },
      }),
      [],
    );
  }
});

test("results are repeatable, bounded, sanitized and stably cited", async () => {
  const semantic = new SemanticRetriever(
    corpus,
    new DeterministicEmbeddingProvider(),
    { minScore: -1 },
  );
  const query = { query: "remote login from home office", topK: 20 };
  const first = await semantic.retrieve(query);
  const second = await semantic.retrieve(query);
  assert.deepEqual(second, first);
  assert.ok(first.length <= 10);
  assert.ok(first.every((result) => !/[<>\u0000-\u001f\u007f]/.test(result.excerpt)));
  assert.ok(first.every((result) =>
    result.citation.label === `${result.documentId}@${result.metadata.version}#${result.chunkId}`));
  assert.equal(first.filter((result) => result.excerpt.includes("alert(1)")).length, 2);
});

test("semantic suppresses repeated chunk identities before the limit and keeps the strongest", async () => {
  const duplicateCorpus = {
    documents: [document("duplicate-doc"), document("other-doc")],
    chunks: [
      { chunkId: "same", documentId: "duplicate-doc", heading: "weak", content: "weak" },
      { chunkId: "same", documentId: "duplicate-doc", heading: "strong", content: "strong" },
      { chunkId: "other", documentId: "other-doc", heading: "other", content: "other" },
    ],
  };
  const vectors = [
    [1, ...Array(DIMENSIONS - 1).fill(0)],
    [0, 1, ...Array(DIMENSIONS - 2).fill(0)],
    [1, ...Array(DIMENSIONS - 1).fill(0)],
  ];
  const provider = {
    id: "controlled",
    embed: async (texts) => texts.length === 1
      ? [[0, 1, ...Array(DIMENSIONS - 2).fill(0)]]
      : vectors,
  };
  const semantic = new SemanticRetriever(duplicateCorpus, provider, { minScore: -1 });
  const results = await semantic.retrieve({ query: "controlled", topK: 2 });
  assert.deepEqual(results.map((result) => [result.documentId, result.chunkId]), [
    ["duplicate-doc", "same"],
    ["other-doc", "other"],
  ]);
  assert.equal(results[0].heading, "strong");
  assert.equal(results[0].score, 1);
});

test("RRF is bounded, deterministic and rejects unsafe constants", () => {
  const result = (chunkId) => ({ chunkId });
  const rankings = [
    [result("b"), result("a")],
    [result("a"), result("b")],
  ];
  assert.deepEqual(
    reciprocalRankFusion(rankings, { k: 60 }).map((entry) => entry.result.chunkId),
    ["a", "b"],
  );
  for (const k of [0, -1, 1001, 1.5, Number.NaN])
    assert.throws(() => reciprocalRankFusion(rankings, { k }), /RRF k/);
});

test("RRF fuses the same composite identity once and selects its strongest representative", () => {
  const result = (documentId, chunkId, score, label = `${documentId}@1#${chunkId}`) => ({
    documentId, chunkId, score, citation: { label },
  });
  const lexicalWinner = result("doc", "same", 0.8);
  const semanticWinner = result("doc", "same", 0.9);
  const collision = result("another-doc", "same", 0.7);
  const fused = reciprocalRankFusion([
    [lexicalWinner, lexicalWinner, collision],
    [semanticWinner],
  ]);
  assert.equal(fused.length, 2);
  assert.equal(fused[0].result, semanticWinner);
  assert.deepEqual(fused.map(({ result: value }) => value.documentId), ["doc", "another-doc"]);
  assert.deepEqual(reciprocalRankFusion([[collision], [semanticWinner]]), reciprocalRankFusion([[semanticWinner], [collision]]));
});
