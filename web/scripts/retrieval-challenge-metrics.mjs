// Generic, deterministic document-level metrics for frozen retrieval challenges.
// This module deliberately has no dataset or retriever imports.

const ratio = (numerator, denominator) =>
  denominator === 0 ? 0 : numerator / denominator;

const lower = (value) => String(value ?? "").toLocaleLowerCase("en-US");

export function collapseToDocuments(results = []) {
  if (!Array.isArray(results)) throw new TypeError("results must be an array");
  const seen = new Set();
  const documents = [];
  for (const result of results) {
    if (!result || typeof result.documentId !== "string" || !result.documentId)
      throw new TypeError("every result must have a non-empty documentId");
    if (seen.has(result.documentId)) continue;
    seen.add(result.documentId);
    documents.push(result);
  }
  return documents;
}

export function validateRankedResults(results, corpus, metadataFilters = {}) {
  const documents = new Map((corpus?.documents ?? []).map((item) => [item.documentId, item]));
  const chunks = new Map(
    (corpus?.chunks ?? []).map((item) => [`${item.documentId}\0${item.chunkId}`, item]),
  );
  let invalidCitationCount = 0;
  let duplicateDocumentIdentityCount = 0;
  let approvedViolations = 0;
  let metadataFilterViolations = 0;
  const seenDocuments = new Set();

  for (const result of results ?? []) {
    const document = documents.get(result.documentId);
    const chunk = chunks.get(`${result.documentId}\0${result.chunkId}`);
    const expectedLabel = document && chunk
      ? `${document.documentId}@${document.version}#${chunk.chunkId}`
      : null;
    if (
      !document ||
      !chunk ||
      result.citation?.documentId !== result.documentId ||
      result.citation?.chunkId !== result.chunkId ||
      result.citation?.label !== expectedLabel
    ) invalidCitationCount++;

    if (seenDocuments.has(result.documentId)) duplicateDocumentIdentityCount++;
    seenDocuments.add(result.documentId);
    if (document?.approvalStatus !== "approved") approvedViolations++;
    if (
      Object.entries(metadataFilters).some(
        ([key, value]) => lower(document?.[key]) !== lower(value),
      )
    ) metadataFilterViolations++;
  }

  return {
    invalidCitationCount,
    duplicateDocumentIdentityCount,
    approvedOnlyCorrect: approvedViolations === 0,
    metadataFilterCorrect: metadataFilterViolations === 0,
  };
}

function documentGrades(evaluationCase) {
  const grades = new Map();
  for (const judgment of evaluationCase.relevance ?? []) {
    if (judgment.chunkId !== undefined) continue;
    grades.set(
      judgment.documentId,
      Math.max(grades.get(judgment.documentId) ?? 0, judgment.grade),
    );
  }
  return grades;
}

export function evaluateChallengeCase(evaluationCase, run, corpus) {
  const ranked = collapseToDocuments(run.results ?? []);
  const grades = documentGrades(evaluationCase);
  const relevant = new Set(
    [...grades].filter(([, grade]) => grade >= 2).map(([documentId]) => documentId),
  );
  const ids = ranked.map((item) => item.documentId);
  const recallAt = (limit) =>
    ratio(ids.slice(0, limit).filter((id) => relevant.has(id)).length, relevant.size);
  const firstRelevant = ids.findIndex((id) => relevant.has(id));
  const dcg = ids.slice(0, 3).reduce(
    (sum, id, index) => sum + ((2 ** (grades.get(id) ?? 0)) - 1) / Math.log2(index + 2),
    0,
  );
  const idealDcg = [...grades.values()]
    .sort((a, b) => b - a)
    .slice(0, 3)
    .reduce((sum, grade, index) => sum + ((2 ** grade) - 1) / Math.log2(index + 2), 0);
  const predictedAbstention = run.abstained === true && ranked.length === 0;
  const validation = validateRankedResults(
    run.results ?? [],
    corpus,
    evaluationCase.metadataFilters ?? {},
  );

  return {
    caseId: evaluationCase.caseId,
    category: evaluationCase.category,
    applicableToRetrieval: evaluationCase.expectedAbstention !== true,
    recallAt1: recallAt(1),
    recallAt3: recallAt(3),
    recallAt5: recallAt(5),
    reciprocalRank: firstRelevant < 0 ? 0 : 1 / (firstRelevant + 1),
    ndcgAt3: ratio(dcg, idealDcg),
    precisionAt3: ids.slice(0, 3).filter((id) => relevant.has(id)).length / 3,
    expectedAbstention: evaluationCase.expectedAbstention === true,
    predictedAbstention,
    metadataFilterApplicable:
      Object.keys(evaluationCase.metadataFilters ?? {}).length > 0,
    ...validation,
  };
}

export function aggregateChallengeMetrics(caseMetrics) {
  const retrieval = caseMetrics.filter((item) => item.applicableToRetrieval);
  const metadataFilterCases = caseMetrics.filter(
    (item) => item.metadataFilterApplicable,
  );
  const mean = (key) => ratio(
    retrieval.reduce((sum, item) => sum + item[key], 0),
    retrieval.length,
  );
  const tp = caseMetrics.filter((x) => x.expectedAbstention && x.predictedAbstention).length;
  const fp = caseMetrics.filter((x) => !x.expectedAbstention && x.predictedAbstention).length;
  const fn = caseMetrics.filter((x) => x.expectedAbstention && !x.predictedAbstention).length;
  const tn = caseMetrics.length - tp - fp - fn;
  const abstentionPrecision = ratio(tp, tp + fp);
  const abstentionRecall = ratio(tp, tp + fn);
  return {
    cases: caseMetrics.length,
    retrievalCases: retrieval.length,
    recallAt1: mean("recallAt1"),
    recallAt3: mean("recallAt3"),
    recallAt5: mean("recallAt5"),
    meanReciprocalRank: mean("reciprocalRank"),
    ndcgAt3: mean("ndcgAt3"),
    precisionAt3: mean("precisionAt3"),
    abstention: {
      truePositive: tp,
      falsePositive: fp,
      falseNegative: fn,
      trueNegative: tn,
      precision: abstentionPrecision,
      recall: abstentionRecall,
      f1: ratio(2 * abstentionPrecision * abstentionRecall, abstentionPrecision + abstentionRecall),
    },
    invalidCitationCount: caseMetrics.reduce((sum, x) => sum + x.invalidCitationCount, 0),
    duplicateDocumentIdentityCount: caseMetrics.reduce(
      (sum, x) => sum + x.duplicateDocumentIdentityCount,
      0,
    ),
    approvedOnlyCorrectness: ratio(
      caseMetrics.filter((x) => x.approvedOnlyCorrect).length,
      caseMetrics.length,
    ),
    metadataFilterCorrectness: ratio(
      metadataFilterCases.filter((x) => x.metadataFilterCorrect).length,
      metadataFilterCases.length,
    ),
  };
}

export function calculateChallengeMetrics(cases, runs, corpus) {
  if (!Array.isArray(cases) || !Array.isArray(runs) || cases.length !== runs.length)
    throw new TypeError("cases and runs must be arrays of equal length");
  const perCase = cases.map((item, index) => evaluateChallengeCase(item, runs[index], corpus));
  const byCategory = Object.fromEntries(
    [...new Set(perCase.map((item) => item.category))]
      .sort()
      .map((category) => [
        category,
        aggregateChallengeMetrics(perCase.filter((item) => item.category === category)),
      ]),
  );
  return { overall: aggregateChallengeMetrics(perCase), byCategory, perCase };
}

function seededRandom(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

const linearQuantile = (ordered, probability) => {
  if (!ordered.length) return 0;
  const position = (ordered.length - 1) * probability;
  const lowerIndex = Math.floor(position);
  const fraction = position - lowerIndex;
  return ordered[lowerIndex] + fraction * ((ordered[lowerIndex + 1] ?? ordered[lowerIndex]) - ordered[lowerIndex]);
};

export function pairedBootstrapDifference(
  baseline,
  candidate,
  { seed, resamples = 10_000, confidence = 0.95 } = {},
) {
  if (!Array.isArray(baseline) || baseline.length === 0 || baseline.length !== candidate?.length)
    throw new TypeError("paired metric arrays must have the same non-zero length");
  if (!Number.isInteger(seed)) throw new TypeError("a fixed integer bootstrap seed is required");
  if (!Number.isInteger(resamples) || resamples < 1) throw new RangeError("resamples must be positive");
  if (!(confidence > 0 && confidence < 1)) throw new RangeError("confidence must be between zero and one");
  if ([...baseline, ...candidate].some((value) => !Number.isFinite(value)))
    throw new TypeError("paired metrics must be finite numbers");
  const random = seededRandom(seed);
  const differences = [];
  for (let sample = 0; sample < resamples; sample++) {
    let total = 0;
    for (let index = 0; index < baseline.length; index++) {
      const selected = Math.floor(random() * baseline.length);
      total += candidate[selected] - baseline[selected];
    }
    differences.push(total / baseline.length);
  }
  differences.sort((a, b) => a - b);
  const alpha = (1 - confidence) / 2;
  return {
    difference: candidate.reduce((sum, value, index) => sum + value - baseline[index], 0) / baseline.length,
    confidence,
    lower: linearQuantile(differences, alpha),
    upper: linearQuantile(differences, 1 - alpha),
    seed,
    resamples,
  };
}
