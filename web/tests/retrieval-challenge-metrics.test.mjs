import assert from "node:assert/strict";
import test from "node:test";

import {
  aggregateChallengeMetrics,
  calculateChallengeMetrics,
  collapseToDocuments,
  evaluateChallengeCase,
  pairedBootstrapDifference,
  validateRankedResults,
} from "../scripts/retrieval-challenge-metrics.mjs";

// Deliberately synthetic and unrelated to the frozen challenge queries.
const corpus = {
  documents: [
    { documentId: "atlas", version: "1", approvalStatus: "approved", service: "maps" },
    { documentId: "birch", version: "2", approvalStatus: "approved", service: "garden" },
    { documentId: "cobalt", version: "1", approvalStatus: "draft", service: "paint" },
  ],
  chunks: [
    { documentId: "atlas", chunkId: "a-1" },
    { documentId: "atlas", chunkId: "a-2" },
    { documentId: "birch", chunkId: "b-1" },
    { documentId: "cobalt", chunkId: "c-1" },
  ],
};

const result = (documentId, chunkId, version, extra = {}) => ({
  documentId,
  chunkId,
  citation: {
    documentId,
    chunkId,
    label: `${documentId}@${version}#${chunkId}`,
  },
  ...extra,
});

test("document collapse keeps the highest-ranked chunk and applies top-K afterwards", () => {
  const rankedChunks = [
    result("atlas", "a-2", "1", { score: 0.91 }),
    result("atlas", "a-1", "1", { score: 0.90 }),
    result("birch", "b-1", "2", { score: 0.89 }),
  ];
  assert.deepEqual(
    collapseToDocuments(rankedChunks).map(({ documentId, chunkId }) => [documentId, chunkId]),
    [["atlas", "a-2"], ["birch", "b-1"]],
  );
});

test("binary metrics use grades 2-3 while nDCG retains adjudicated grade-1 gain", () => {
  const evaluationCase = {
    caseId: "toy-graded",
    category: "toy",
    expectedAbstention: false,
    relevance: [
      { documentId: "atlas", grade: 3 },
      { documentId: "birch", grade: 2 },
      { documentId: "context-only", grade: 1 },
    ],
  };
  const metrics = evaluateChallengeCase(
    evaluationCase,
    {
      abstained: false,
      results: [
        result("birch", "b-1", "2"),
        result("atlas", "a-2", "1"),
        result("atlas", "a-1", "1"),
      ],
    },
    corpus,
  );
  const expectedDcg = 3 + 7 / Math.log2(3);
  const idealDcg = 7 + 3 / Math.log2(3) + 1 / Math.log2(4);
  assert.equal(metrics.recallAt1, 0.5);
  assert.equal(metrics.recallAt3, 1);
  assert.equal(metrics.recallAt5, 1);
  assert.equal(metrics.reciprocalRank, 1);
  assert.equal(metrics.precisionAt3, 2 / 3);
  assert.equal(metrics.ndcgAt3, expectedDcg / idealDcg);
});

test("citation, duplicate identity, approval, and exact metadata checks are independent", () => {
  const results = [
    result("atlas", "a-1", "1"),
    result("atlas", "a-2", "1"),
    result("cobalt", "c-1", "1", {
      citation: { documentId: "cobalt", chunkId: "wrong", label: "fabricated" },
    }),
  ];
  assert.deepEqual(validateRankedResults(results, corpus, { service: "maps" }), {
    invalidCitationCount: 1,
    duplicateDocumentIdentityCount: 1,
    approvedOnlyCorrect: false,
    metadataFilterCorrect: false,
  });
});

test("abstention confusion counts require an explicit empty-evidence abstention", () => {
  const base = {
    applicableToRetrieval: false,
    recallAt1: 0,
    recallAt3: 0,
    recallAt5: 0,
    reciprocalRank: 0,
    ndcgAt3: 0,
    precisionAt3: 0,
    invalidCitationCount: 0,
    duplicateDocumentIdentityCount: 0,
    approvedOnlyCorrect: true,
    metadataFilterCorrect: true,
    metadataFilterApplicable: false,
  };
  const metrics = aggregateChallengeMetrics([
    { ...base, expectedAbstention: true, predictedAbstention: true },
    { ...base, expectedAbstention: true, predictedAbstention: false },
    { ...base, expectedAbstention: false, predictedAbstention: true },
    { ...base, expectedAbstention: false, predictedAbstention: false },
  ]);
  assert.deepEqual(metrics.abstention, {
    truePositive: 1,
    falsePositive: 1,
    falseNegative: 1,
    trueNegative: 1,
    precision: 0.5,
    recall: 0.5,
    f1: 0.5,
  });
});

test("metadata correctness is calculated over filtered cases only", () => {
  const cases = [
    {
      caseId: "filtered",
      category: "toy",
      expectedAbstention: false,
      metadataFilters: { service: "maps" },
      relevance: [{ documentId: "atlas", grade: 3 }],
    },
    {
      caseId: "unfiltered",
      category: "toy",
      expectedAbstention: false,
      relevance: [{ documentId: "birch", grade: 3 }],
    },
  ];
  const runs = [
    { abstained: false, results: [result("birch", "b-1", "2")] },
    { abstained: false, results: [result("birch", "b-1", "2")] },
  ];
  assert.equal(calculateChallengeMetrics(cases, runs, corpus).overall.metadataFilterCorrectness, 0);
});

test("paired bootstrap is deterministic, paired, and validates its preregistration inputs", () => {
  const baseline = [0, 0.5, 1, 0.25];
  const candidate = [0.5, 0.5, 1, 0.75];
  const options = { seed: 20260914, resamples: 10_000, confidence: 0.95 };
  const first = pairedBootstrapDifference(baseline, candidate, options);
  assert.deepEqual(first, pairedBootstrapDifference(baseline, candidate, options));
  assert.equal(first.difference, 0.25);
  assert.equal(first.seed, 20260914);
  assert.equal(first.resamples, 10_000);
  assert.ok(first.lower <= first.difference && first.difference <= first.upper);
  assert.throws(() => pairedBootstrapDifference([], [], options), /non-zero/);
  assert.throws(() => pairedBootstrapDifference([0], [1], {}), /fixed integer/);
});
