import assert from "node:assert/strict";
import test from "node:test";
import {
  calculateRetrievalMetrics,
  percentile,
} from "./retrieval-metrics-lib.mjs";

test("retrieval laboratory metrics use deterministic binary relevance definitions", () => {
  const cases = [
    { id: "first", expectedDocumentIds: ["a"], shouldAbstain: false },
    { id: "third", expectedDocumentIds: ["c"], shouldAbstain: false },
    { id: "miss", expectedDocumentIds: ["z"], shouldAbstain: false },
    { id: "correct-abstain", expectedDocumentIds: [], shouldAbstain: true },
    { id: "false-answer", expectedDocumentIds: [], shouldAbstain: true },
  ];
  const runs = [
    { results: [{ documentId: "a" }], latencyMs: 1 },
    {
      results: [
        { documentId: "a" },
        { documentId: "b" },
        { documentId: "c" },
      ],
      latencyMs: 2,
    },
    { results: [], latencyMs: 3 },
    { results: [], latencyMs: 4 },
    { results: [{ documentId: "x" }], latencyMs: 100 },
  ];
  const metrics = calculateRetrievalMetrics(cases, runs);
  assert.deepEqual(metrics, {
    cases: 5,
    relevantCases: 3,
    recallAt1: 1 / 3,
    recallAt3: 2 / 3,
    recallAt5: 2 / 3,
    meanReciprocalRank: (1 + 1 / 3) / 3,
    ndcgAt3: (1 + 1 / 2) / 3,
    precisionAt3: 2 / 9,
    abstentionPrecision: 1 / 2,
    abstentionRecall: 1 / 2,
    abstentionF1: 1 / 2,
    latencyMs: { p50: 3, p95: 100, p99: 100 },
  });
});

test("metrics reject malformed inputs and define empty results without NaN", () => {
  assert.deepEqual(calculateRetrievalMetrics([], []), {
    cases: 0,
    relevantCases: 0,
    recallAt1: 0,
    recallAt3: 0,
    recallAt5: 0,
    meanReciprocalRank: 0,
    ndcgAt3: 0,
    precisionAt3: 0,
    abstentionPrecision: 0,
    abstentionRecall: 0,
    abstentionF1: 0,
    latencyMs: { p50: 0, p95: 0, p99: 0 },
  });
  assert.throws(() => calculateRetrievalMetrics([{}], []), /equal length/);
  assert.throws(() => percentile([1, -1], 0.5), /non-negative/);
  assert.throws(() => percentile([1], 1.1), /quantile/);
});

test("metric calculation is repeatable and does not mutate ranked results", () => {
  const cases = [
    { id: "repeat", expectedDocumentIds: ["b"], shouldAbstain: false },
  ];
  const runs = [
    {
      results: [{ documentId: "a" }, { documentId: "b" }],
      latencyMs: 7,
    },
  ];
  const snapshot = structuredClone(runs);
  assert.deepEqual(
    calculateRetrievalMetrics(cases, runs),
    calculateRetrievalMetrics(cases, runs),
  );
  assert.deepEqual(runs, snapshot);
});
