const ratio = (numerator, denominator) =>
  denominator === 0 ? 0 : numerator / denominator;

export function percentile(values, quantile) {
  if (!Array.isArray(values) || values.length === 0) return 0;
  if (!Number.isFinite(quantile) || quantile < 0 || quantile > 1)
    throw new RangeError("quantile must be between 0 and 1");
  const ordered = values.map(Number).sort((a, b) => a - b);
  if (ordered.some((value) => !Number.isFinite(value) || value < 0))
    throw new TypeError("latencies must be finite non-negative numbers");
  return ordered[Math.ceil(quantile * ordered.length) - 1] ?? ordered[0];
}

export function calculateRetrievalMetrics(cases, runs) {
  if (!Array.isArray(cases) || !Array.isArray(runs) || cases.length !== runs.length)
    throw new TypeError("cases and runs must be arrays of equal length");

  let relevantCases = 0;
  let recall1 = 0;
  let recall3 = 0;
  let recall5 = 0;
  let reciprocalRank = 0;
  let discountedGain3 = 0;
  let precision3 = 0;
  let abstainTruePositive = 0;
  let abstainFalsePositive = 0;
  let abstainFalseNegative = 0;

  for (let index = 0; index < cases.length; index++) {
    const evaluationCase = cases[index];
    const run = runs[index];
    const expected = new Set(evaluationCase.expectedDocumentIds ?? []);
    const ranked = (run.results ?? []).map((result) => result.documentId);
    const predictedAbstention = ranked.length === 0;
    const expectedAbstention = evaluationCase.shouldAbstain === true;

    if (expectedAbstention && predictedAbstention) abstainTruePositive++;
    else if (!expectedAbstention && predictedAbstention) abstainFalsePositive++;
    else if (expectedAbstention && !predictedAbstention) abstainFalseNegative++;

    if (expectedAbstention) continue;
    relevantCases++;
    const firstRank = ranked.findIndex((id) => expected.has(id));
    if (firstRank >= 0 && firstRank < 1) recall1++;
    if (firstRank >= 0 && firstRank < 3) recall3++;
    if (firstRank >= 0 && firstRank < 5) recall5++;
    if (firstRank >= 0) reciprocalRank += 1 / (firstRank + 1);

    let dcg = 0;
    for (let rank = 0; rank < Math.min(3, ranked.length); rank++)
      if (expected.has(ranked[rank])) dcg += 1 / Math.log2(rank + 2);
    let ideal = 0;
    for (let rank = 0; rank < Math.min(3, expected.size); rank++)
      ideal += 1 / Math.log2(rank + 2);
    discountedGain3 += ratio(dcg, ideal);
    precision3 +=
      ranked.slice(0, 3).filter((id) => expected.has(id)).length / 3;
  }

  const abstentionPrecision = ratio(
    abstainTruePositive,
    abstainTruePositive + abstainFalsePositive,
  );
  const abstentionRecall = ratio(
    abstainTruePositive,
    abstainTruePositive + abstainFalseNegative,
  );
  const latencies = runs.map((run) => run.latencyMs);
  return {
    cases: cases.length,
    relevantCases,
    recallAt1: ratio(recall1, relevantCases),
    recallAt3: ratio(recall3, relevantCases),
    recallAt5: ratio(recall5, relevantCases),
    meanReciprocalRank: ratio(reciprocalRank, relevantCases),
    ndcgAt3: ratio(discountedGain3, relevantCases),
    precisionAt3: ratio(precision3, relevantCases),
    abstentionPrecision,
    abstentionRecall,
    abstentionF1: ratio(
      2 * abstentionPrecision * abstentionRecall,
      abstentionPrecision + abstentionRecall,
    ),
    latencyMs: {
      p50: percentile(latencies, 0.5),
      p95: percentile(latencies, 0.95),
      p99: percentile(latencies, 0.99),
    },
  };
}
