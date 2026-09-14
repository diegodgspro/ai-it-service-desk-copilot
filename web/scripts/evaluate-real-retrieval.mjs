// Explicit local experiment only. This script is not part of normal tests or builds.
import { build } from "esbuild";
import { Miniflare, convertV4MiniflareOptions } from "miniflare";
import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, relative, resolve } from "node:path";
import { performance } from "node:perf_hooks";
import { BgeLocalProvider } from "./bge-local-provider.mjs";
import { HybridRetriever, SemanticRetriever } from "./retrieval-lab-core.mjs";
import { calculateRetrievalMetrics, percentile } from "../tests/retrieval-metrics-lib.mjs";

const QUERY_INSTRUCTION = "Represent this sentence for searching relevant passages: ";
const args = Object.fromEntries(process.argv.slice(2).map((x) => {
  const [key, ...value] = x.replace(/^--/, "").split("="); return [key, value.join("=") || true];
}));
if (!args.python) throw new Error("usage: node scripts/evaluate-real-retrieval.mjs --python=<semantic-python> --cache=<ignored-cache-dir>");
if (!args.cache) throw new Error("an explicit ignored local --cache directory is required");
const webRoot = resolve(new URL("..", import.meta.url).pathname.replace(/^\/(.:)/, "$1"));
const repoRoot = resolve(webRoot, "..");
const cache = resolve(String(args.cache));
const cacheRelative = relative(repoRoot, cache);
if (!cacheRelative || cacheRelative.startsWith("..") || resolve(repoRoot, cacheRelative) !== cache)
  throw new Error("semantic cache must be inside the repository");
const corpus = JSON.parse(await readFile(join(webRoot, "shared", "knowledge.json"), "utf8"));
const dataset = JSON.parse(await readFile(join(webRoot, "tests", "retrieval-real-evaluation.json"), "utf8"));
const cases = dataset.cases;

async function createCanonicalD1() {
  const output = await build({ entryPoints: [join(webRoot, "worker", "index.ts")], bundle: true, write: false, format: "esm", platform: "browser" });
  const persist = await mkdtemp(join(tmpdir(), "deskpilot-real-eval-"));
  const origin = "http://localhost";
  const mf = new Miniflare(convertV4MiniflareOptions({ modules: true, script: output.outputFiles[0].text,
    compatibilityDate: "2026-09-09", bindings: { APP_ENV: "local", LOCAL_DEV_IDENTITY: "enabled" },
    serviceBindings: { ASSETS: () => new Response("") }, d1Databases: { DB: "evaluation-db" }, resourcePersistencePath: persist }));
  const db = await mf.getD1Database("DB");
  for (const name of (await readdir(join(webRoot, "migrations"))).filter((x) => x.endsWith(".sql")).sort())
    await db.exec((await readFile(join(webRoot, "migrations", name), "utf8")).replace(/^--.*$/gm, "").replaceAll("\n", " "));
  await db.exec((await readFile(join(webRoot, "knowledge-seed.sql"), "utf8")).replace(/^--.*$/gm, "").replaceAll("\n", " "));
  const lexical = { id: "canonical-local-d1-fts5", async retrieve(input) {
    const response = await mf.dispatchFetch(origin + "/api/knowledge/retrieve", { method: "POST",
      headers: { "Content-Type": "application/json", Origin: origin }, body: JSON.stringify(input) });
    if (!response.ok) throw new Error(`canonical D1 request failed: ${response.status}`);
    return (await response.json()).results;
  }};
  return { lexical, close: async () => { await mf.dispose(); await rm(persist, { recursive: true, force: true }); } };
}

function validateResults(results) {
  let incorrectCitations = 0, duplicates = 0;
  const identities = new Set();
  for (const result of results) {
    const doc = corpus.documents.find((x) => x.documentId === result.documentId);
    const chunk = corpus.chunks.find((x) => x.documentId === result.documentId && x.chunkId === result.chunkId);
    const expected = doc && `${doc.documentId}@${doc.version}#${chunk?.chunkId}`;
    if (!doc || !chunk || result.citation?.label !== expected) incorrectCitations++;
    const identity = `${result.documentId}\0${result.chunkId}`;
    if (identities.has(identity)) duplicates++;
    identities.add(identity);
  }
  return { incorrectCitations, duplicates };
}

async function execute(retriever, selected, extra = {}) {
  const runs = [], warm = [], repeats = [];
  for (const c of selected) {
    const input = { query: c.query, filters: c.filters, topK: 5, ...extra };
    const start = performance.now(), results = await retriever.retrieve(input), elapsed = performance.now() - start;
    const againStart = performance.now(), again = await retriever.retrieve(input), againElapsed = performance.now() - againStart;
    runs.push({ results, latencyMs: elapsed }); warm.push(againElapsed); repeats.push(JSON.stringify(results) === JSON.stringify(again));
  }
  const validation = runs.map((x) => validateResults(x.results));
  return { runs, warm, repeatability: repeats.filter(Boolean).length / repeats.length,
    incorrectCitationCount: validation.reduce((n, x) => n + x.incorrectCitations, 0),
    duplicateResultCount: validation.reduce((n, x) => n + x.duplicates, 0) };
}

function summarize(selected, execution) {
  const metrics = calculateRetrievalMetrics(selected, execution.runs);
  const byCategory = {};
  for (const category of new Set(selected.map((item) => item.category))) {
    const indexes = selected.map((item, index) => item.category === category ? index : -1).filter((index) => index >= 0);
    byCategory[category] = calculateRetrievalMetrics(indexes.map((index) => selected[index]), indexes.map((index) => execution.runs[index]));
  }
  const transferIndexes = selected.map((item, index) => ["paraphrase", "synonym"].includes(item.category) ? index : -1).filter((index) => index >= 0);
  byCategory.paraphraseAndSynonym = calculateRetrievalMetrics(transferIndexes.map((index) => selected[index]), transferIndexes.map((index) => execution.runs[index]));
  return { ...metrics,
    warmLatencyMs: { p50: percentile(execution.warm, .5), p95: percentile(execution.warm, .95) },
    byCategory,
    deterministicRepeatability: execution.repeatability, incorrectCitationCount: execution.incorrectCitationCount,
    duplicateResultCount: execution.duplicateResultCount,
    approvedOnlyCorrectness: execution.runs.every((run) => run.results.every((x) => x.metadata.approvalStatus === "approved")) ? 1 : 0,
    metadataFilterCorrectness: selected.every((c, index) => execution.runs[index].results.every((x) =>
      !c.filters || Object.entries(c.filters).every(([key, value]) => String(x.metadata[key]).toLowerCase() === String(value).toLowerCase()))) ? 1 : 0 };
}

function score(metrics) { return metrics.recallAt3 + metrics.meanReciprocalRank + metrics.abstentionF1; }
async function chooseThreshold(retriever, development) {
  let winner;
  for (const threshold of [.2, .25, .3, .32, .35, .4, .45, .5]) {
    const metrics = summarize(development, await execute(retriever, development, { semanticMinScore: threshold }));
    const candidate = { threshold, objective: score(metrics), metrics };
    if (!winner || candidate.objective > winner.objective || (candidate.objective === winner.objective && threshold > winner.threshold)) winner = candidate;
  }
  return winner;
}

const d1 = await createCanonicalD1();
let provider;
try {
  const providerStarted = performance.now();
  provider = new BgeLocalProvider({ python: String(args.python), modelDir: join(cache, "model"), cwd: repoRoot,
    env: { HF_HOME: cache, HF_HUB_OFFLINE: "1", TRANSFORMERS_OFFLINE: "1" } });
  const development = cases.filter((x) => x.split === "development");
  const evaluated = cases.filter((x) => x.split !== "development");
  const model = await provider.metadata();
  const modelLoadMs = performance.now() - providerStarted;
  const report = { schemaVersion: 1, generatedAt: new Date().toISOString(), model: {...model, modelLoadMs}, dataset: {
    total: cases.length, development: development.length, heldOut: evaluated.length }, configurations: {} };
  report.configurations.lexical = summarize(evaluated, await execute(d1.lexical, evaluated, { minScore: .5 }));
  for (const [queryMode, prefix] of [["original", ""], ["official-short-query-instruction", QUERY_INSTRUCTION]]) {
    const semanticFactory = (threshold) => new SemanticRetriever(corpus, provider, { minScore: threshold, queryTransform: (q) => prefix + q });
    const semantic = semanticFactory(.32);
    const selected = await chooseThreshold(semantic, development);
    const hybrid = new HybridRetriever(d1.lexical, semantic);
    report.configurations[`semantic:${queryMode}`] = { selectedOnDevelopment: selected,
      heldOut: summarize(evaluated, await execute(semantic, evaluated, { semanticMinScore: selected.threshold })) };
    report.configurations[`hybrid:${queryMode}`] = { selectedOnDevelopment: { semanticThreshold: selected.threshold },
      heldOut: summarize(evaluated, await execute(hybrid, evaluated, { semanticMinScore: selected.threshold, minScore: .5 })) };
  }
  if (args.compact) {
    const compact = { model: report.model, dataset: report.dataset, configurations: {} };
    for (const [name, value] of Object.entries(report.configurations)) {
      const metrics = value.heldOut ?? value;
      compact.configurations[name] = {
        selectedOnDevelopment: value.selectedOnDevelopment,
        recallAt1: metrics.recallAt1, recallAt3: metrics.recallAt3, recallAt5: metrics.recallAt5,
        meanReciprocalRank: metrics.meanReciprocalRank, ndcgAt3: metrics.ndcgAt3,
        precisionAt3: metrics.precisionAt3, abstentionPrecision: metrics.abstentionPrecision,
        abstentionRecall: metrics.abstentionRecall, abstentionF1: metrics.abstentionF1,
        warmLatencyMs: metrics.warmLatencyMs, firstPassLatencyMs: metrics.latencyMs,
        paraphraseAndSynonym: metrics.byCategory.paraphraseAndSynonym,
        incorrectCitationCount: metrics.incorrectCitationCount,
        deterministicRepeatability: metrics.deterministicRepeatability,
        approvedOnlyCorrectness: metrics.approvedOnlyCorrectness,
        metadataFilterCorrectness: metrics.metadataFilterCorrectness,
      };
    }
    process.stdout.write(JSON.stringify(compact, null, 2) + "\n");
  } else process.stdout.write(JSON.stringify(report, null, 2) + "\n");
} finally { await provider?.close(); await d1.close(); }
