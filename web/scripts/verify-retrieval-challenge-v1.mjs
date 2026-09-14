// Independent recalculation and deterministic Markdown reporting from saved raw results.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { CONTRACT, serialize } from "./run-retrieval-challenge-v1.mjs";

const ratio = (a, b) => b ? a / b : 0;
const independentCalculate = (cases, runs, corpus) => {
  const docs = new Map(corpus.documents.map((x) => [x.documentId, x]));
  const chunks = new Set(corpus.chunks.map((x) => `${x.documentId}\0${x.chunkId}`));
  const perCase = cases.map((c, index) => {
    const seen = new Set(), ranked = [];
    for (const result of runs[index].results) if (!seen.has(result.documentId)) { seen.add(result.documentId); ranked.push(result); }
    const grades = new Map(c.relevance.filter((x) => x.chunkId === undefined).map((x) => [x.documentId, x.grade]));
    const relevant = new Set([...grades].filter(([, grade]) => grade >= 2).map(([id]) => id));
    const ids = ranked.map((x) => x.documentId), recall = (k) => ratio(ids.slice(0, k).filter((id) => relevant.has(id)).length, relevant.size);
    const first = ids.findIndex((id) => relevant.has(id));
    const dcg = ids.slice(0, 3).reduce((sum, id, rank) => sum + (2 ** (grades.get(id) ?? 0) - 1) / Math.log2(rank + 2), 0);
    const idcg = [...grades.values()].sort((a, b) => b - a).slice(0, 3).reduce((sum, grade, rank) => sum + (2 ** grade - 1) / Math.log2(rank + 2), 0);
    let invalidCitationCount = 0, duplicateDocumentIdentityCount = 0; const rawSeen = new Set();
    for (const result of runs[index].results) {
      const doc = docs.get(result.documentId), validChunk = chunks.has(`${result.documentId}\0${result.chunkId}`);
      if (!doc || !validChunk || result.citation?.documentId !== result.documentId || result.citation?.chunkId !== result.chunkId || result.citation?.label !== `${result.documentId}@${doc?.version}#${result.chunkId}`) invalidCitationCount++;
      if (rawSeen.has(result.documentId)) duplicateDocumentIdentityCount++; rawSeen.add(result.documentId);
    }
    const filterEntries = Object.entries(c.metadataFilters ?? {});
    return { caseId: c.caseId, category: c.category, applicableToRetrieval: !c.expectedAbstention,
      recallAt1: recall(1), recallAt3: recall(3), recallAt5: recall(5), reciprocalRank: first < 0 ? 0 : 1 / (first + 1), ndcgAt3: ratio(dcg, idcg),
      precisionAt3: ids.slice(0, 3).filter((id) => relevant.has(id)).length / 3, expectedAbstention: c.expectedAbstention,
      predictedAbstention: runs[index].abstained === true && ranked.length === 0, metadataFilterApplicable: filterEntries.length > 0,
      invalidCitationCount, duplicateDocumentIdentityCount,
      approvedOnlyCorrect: ranked.every((x) => docs.get(x.documentId)?.approvalStatus === "approved"),
      metadataFilterCorrect: ranked.every((x) => filterEntries.every(([key, value]) => String(docs.get(x.documentId)?.[key] ?? "").toLowerCase() === String(value).toLowerCase())) };
  });
  const aggregate = (items) => {
    const retrieval = items.filter((x) => x.applicableToRetrieval), filtered = items.filter((x) => x.metadataFilterApplicable);
    const mean = (key) => ratio(retrieval.reduce((sum, x) => sum + x[key], 0), retrieval.length);
    const tp = items.filter((x) => x.expectedAbstention && x.predictedAbstention).length, fp = items.filter((x) => !x.expectedAbstention && x.predictedAbstention).length;
    const fn = items.filter((x) => x.expectedAbstention && !x.predictedAbstention).length, tn = items.length - tp - fp - fn;
    const precision = ratio(tp, tp + fp), recall = ratio(tp, tp + fn);
    return { cases: items.length, retrievalCases: retrieval.length, recallAt1: mean("recallAt1"), recallAt3: mean("recallAt3"), recallAt5: mean("recallAt5"),
      meanReciprocalRank: mean("reciprocalRank"), ndcgAt3: mean("ndcgAt3"), precisionAt3: mean("precisionAt3"),
      abstention: { truePositive: tp, falsePositive: fp, falseNegative: fn, trueNegative: tn, precision, recall, f1: ratio(2 * precision * recall, precision + recall) },
      invalidCitationCount: items.reduce((sum, x) => sum + x.invalidCitationCount, 0), duplicateDocumentIdentityCount: items.reduce((sum, x) => sum + x.duplicateDocumentIdentityCount, 0),
      approvedOnlyCorrectness: ratio(items.filter((x) => x.approvedOnlyCorrect).length, items.length), metadataFilterCorrectness: ratio(filtered.filter((x) => x.metadataFilterCorrect).length, filtered.length) };
  };
  const byCategory = Object.fromEntries([...new Set(perCase.map((x) => x.category))].sort().map((category) => [category, aggregate(perCase.filter((x) => x.category === category))]));
  return { overall: aggregate(perCase), byCategory, perCase };
};

const independentComparisons = (metrics) => {
  const randomFactory = (seed) => { let state = seed >>> 0; return () => { state = (state + 0x6d2b79f5) >>> 0; let v = state; v = Math.imul(v ^ v >>> 15, v | 1); v ^= v + Math.imul(v ^ v >>> 7, v | 61); return ((v ^ v >>> 14) >>> 0) / 4294967296; }; };
  const quantile = (xs, p) => { const pos = (xs.length - 1) * p, low = Math.floor(pos), fraction = pos - low; return xs[low] + fraction * ((xs[low + 1] ?? xs[low]) - xs[low]); };
  const output = {};
  for (const candidate of ["semantic", "hybrid"]) { const key = `${candidate}_minus_lexical`; output[key] = {};
    for (const metric of ["recallAt1", "recallAt3", "recallAt5", "reciprocalRank", "ndcgAt3", "precisionAt3"]) {
      const a = metrics.lexical.perCase.filter((x) => x.applicableToRetrieval).map((x) => x[metric]), b = metrics[candidate].perCase.filter((x) => x.applicableToRetrieval).map((x) => x[metric]);
      const random = randomFactory(CONTRACT.bootstrap.seed), samples = [];
      for (let n = 0; n < CONTRACT.bootstrap.resamples; n++) { let sum = 0; for (let i = 0; i < a.length; i++) { const selected = Math.floor(random() * a.length); sum += b[selected] - a[selected]; } samples.push(sum / a.length); }
      samples.sort((x, y) => x - y); output[key][metric] = { difference: b.reduce((sum, x, i) => sum + x - a[i], 0) / a.length, confidence: .95, lower: quantile(samples, .025), upper: quantile(samples, .975), seed: CONTRACT.bootstrap.seed, resamples: CONTRACT.bootstrap.resamples };
    }
  } return output;
};

const args = Object.fromEntries(process.argv.slice(2).map((entry) => {
  const [key, ...parts] = entry.replace(/^--/, "").split("="); return [key, parts.join("=") || true];
}));
if (!args.results || !args.report) throw new Error("--results and --report are required");
const webRoot = resolve(new URL("..", import.meta.url).pathname.replace(/^\/(.:)/, "$1"));
const repoRoot = resolve(webRoot, "..");
const resultsPath = resolve(String(args.results)), reportPath = resolve(String(args.report));
assert.equal(resultsPath, resolve(repoRoot, "docs", "evaluations", "retrieval-challenge-v1-results.json"));
assert.equal(reportPath, resolve(repoRoot, "docs", "evaluations", "retrieval-challenge-v1-report.md"));
const results = JSON.parse(await readFile(resultsPath, "utf8"));
if (results.status !== "valid") throw new Error("cannot verify a non-valid primary result");
const challengeBytes = await readFile(resolve(webRoot, "tests", "retrieval-challenge-v1.json"));
assert.equal(createHash("sha256").update(challengeBytes).digest("hex"), CONTRACT.challengeSha256);
assert.equal(serialize(results.contract), serialize(CONTRACT));
const challenge = JSON.parse(challengeBytes.toString("utf8"));
assert.deepEqual(results.challenge, { version: challenge.datasetVersion, sha256: CONTRACT.challengeSha256, cases: challenge.cases.length });
const corpusBytes = await readFile(resolve(webRoot, "shared", "knowledge.json"));
const seedBytes = await readFile(resolve(webRoot, "knowledge-seed.sql"));
assert.equal(results.corpus.sha256, createHash("sha256").update(corpusBytes).digest("hex"));
assert.equal(results.corpus.d1SeedSha256, createHash("sha256").update(seedBytes).digest("hex"));
const corpus = JSON.parse(corpusBytes.toString("utf8"));
const recalculated = Object.fromEntries(["lexical", "semantic", "hybrid"].map((method) =>
  [method, independentCalculate(challenge.cases, results.methods[method].runs, corpus)]));
assert.equal(serialize(recalculated), serialize(results.metrics), "independent metric recalculation differs");
assert.equal(serialize(independentComparisons(recalculated)), serialize(results.pairedDifferences), "independent bootstrap recalculation differs");

const f = (value) => Number(value).toFixed(3);
const metricRow = (name, data, latency) => `| ${name} | ${f(data.recallAt1)} | ${f(data.recallAt3)} | ${f(data.recallAt5)} | ${f(data.meanReciprocalRank)} | ${f(data.ndcgAt3)} | ${f(data.precisionAt3)} | ${f(data.abstention.precision)} / ${f(data.abstention.recall)} / ${f(data.abstention.f1)} | ${f(latency.p50)} / ${f(latency.p95)} |`;
const lexicalPara = recalculated.lexical.byCategory.paraphrase_synonym;
const hybridPara = recalculated.hybrid.byCategory.paraphrase_synonym;
const absoluteImprovement = hybridPara.recallAt3 - lexicalPara.recallAt3;
const lexicalErrors = recalculated.lexical.perCase.filter((x) => x.category === "paraphrase_synonym" && x.recallAt3 === 0).length;
const hybridErrors = recalculated.hybrid.perCase.filter((x) => x.category === "paraphrase_synonym" && x.recallAt3 === 0).length;
const errorReduction = lexicalErrors ? (lexicalErrors - hybridErrors) / lexicalErrors : 0;
const policyPass = recalculated.hybrid.overall.approvedOnlyCorrectness === 1 &&
  recalculated.hybrid.overall.metadataFilterCorrectness === 1 &&
  recalculated.hybrid.overall.invalidCitationCount === 0 &&
  recalculated.hybrid.overall.duplicateDocumentIdentityCount === 0;
const abstentionPass = recalculated.hybrid.overall.abstention.f1 >= recalculated.lexical.overall.abstention.f1 - 0.02;
const promotionPass = (absoluteImprovement >= 0.1 || errorReduction >= 0.3) && policyPass && abstentionPass;

const lines = [
  "# DeskPilot independent retrieval challenge v1.0.1 results", "",
  `- First-run validity: valid.`,
  `- Independent recalculation: identical.`,
  `- Immutable pre-execution commit: \`${results.preexecutionCommit}\`.`,
  `- Challenge SHA-256: \`${results.challenge.sha256}\`.`,
  `- Corpus: \`${results.corpus.identity}\`, SHA-256 \`${results.corpus.sha256}\`; D1 seed SHA-256 \`${results.corpus.d1SeedSha256}\`.`,
  `- Model: \`${results.contract.modelId}@${results.contract.modelRevision}\`; safetensors SHA-256 \`${results.contract.modelSha256}\`; 384 dimensions, CLS pooling, L2 normalization.`, "",
  "Frozen configurations: canonical local D1 FTS5 at threshold 0.50; instructed BGE semantic at threshold 0.50; guarded hybrid with the same semantic contract and committed bounded RRF k=60/minimum 1/61. No challenge-driven alternatives were evaluated.", "",
  "The immutable pre-execution commit passed CI before execution. Production authenticated D1 FTS5, authentication, authorization, deterministic policy behavior, Worker code, Wrangler, migrations, and v1.2.0 were unchanged.", "",
  "## Overall metrics", "",
  "| Method | R@1 | R@3 | R@5 | MRR | nDCG@3 | P@3 | Abstain P/R/F1 | Warm p50/p95 ms |", "| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |",
  ...["lexical", "semantic", "hybrid"].map((method) => metricRow(method, recalculated[method].overall, results.methods[method].warmLatencyMs)), "",
  "Local warm CPU latency is non-production.", "", "## Category metrics", "",
];
for (const category of Object.keys(recalculated.lexical.byCategory).sort()) {
  lines.push(`### ${category}`, "", "| Method | R@1 | R@3 | R@5 | MRR | nDCG@3 | P@3 | Abstain P/R/F1 |", "| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |",
    ...["lexical", "semantic", "hybrid"].map((method) => metricRow(method, recalculated[method].byCategory[category], { p50: 0, p95: 0 }).replace(/ \| 0\.000 \/ 0\.000 \|$/, " |")), "");
}
lines.push("## Paired improvements and 95% intervals", "");
for (const [comparison, metrics] of Object.entries(results.pairedDifferences)) {
  lines.push(`### ${comparison}`, "", "| Metric | Difference | 95% interval |", "| --- | ---: | ---: |");
  for (const [metric, interval] of Object.entries(metrics)) lines.push(`| ${metric} | ${f(interval.difference)} | [${f(interval.lower)}, ${f(interval.upper)}] |`);
  lines.push("");
}
lines.push("## Validation", "");
for (const method of ["lexical", "semantic", "hybrid"]) {
  const m = recalculated[method].overall;
  lines.push(`- ${method}: abstention TP/FP/FN/TN ${m.abstention.truePositive}/${m.abstention.falsePositive}/${m.abstention.falseNegative}/${m.abstention.trueNegative}; invalid citations ${m.invalidCitationCount}; duplicate document identities ${m.duplicateDocumentIdentityCount}; approved-only ${f(m.approvedOnlyCorrectness)}; metadata-filter ${f(m.metadataFilterCorrectness)}.`);
}
lines.push("", "## Promotion decision", "", `**${promotionPass ? "PASS" : "FAIL"} for architectural planning only; production deployment is not authorized.**`, "",
  `Paraphrase/synonym hybrid R@3 changed by ${f(absoluteImprovement)}; top-3 error reduction was ${f(errorReduction)}. Policy gate: ${policyPass ? "pass" : "fail"}. Abstention non-regression gate: ${abstentionPass ? "pass" : "fail"}.`, "",
  "## Limitations", "", "The challenge is synthetic, English-only, small, and grounded in ten compact portfolio documents. Document metrics collapse each method's frozen ten-chunk output before evaluation top-K, so a document below that candidate cap is unobserved. Document-level judgments do not establish chunk-level relevance. Exact operating-system and source-type filters are enforced by an evaluation adapter because those fields are outside the production query type. Local CPU latency is not a production benchmark. Passing cannot establish production quality, downstream generation safety, or deployment readiness.", "");
await writeFile(reportPath, lines.join("\n"), { encoding: "utf8", flag: "wx" });
process.stdout.write(serialize({ independentRecalculation: "identical", promotionPass }));
