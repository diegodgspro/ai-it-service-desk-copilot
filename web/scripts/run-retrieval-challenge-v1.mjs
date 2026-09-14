// One-shot, offline runner for the preregistered DeskPilot challenge v1.0.1.
import { build } from "esbuild";
import { Miniflare, convertV4MiniflareOptions } from "miniflare";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { access, mkdtemp, readFile, readdir, rename, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, relative, resolve } from "node:path";
import { performance } from "node:perf_hooks";
import { BgeLocalProvider } from "./bge-local-provider.mjs";
import { HybridRetriever, SemanticRetriever } from "./retrieval-lab-core.mjs";
import {
  calculateChallengeMetrics,
  collapseToDocuments,
  pairedBootstrapDifference,
} from "./retrieval-challenge-metrics.mjs";

const CONTRACT = Object.freeze({
  challengeVersion: "1.0.1",
  challengeSha256: "80fe584390415a90a068c6b7b7a2023790985b457798b0991a5d50843f470ec5",
  modelId: "BAAI/bge-small-en-v1.5",
  modelRevision: "5c38ec7c405ec4b44b94cc5a9bb96e735b38267a",
  modelSha256: "3c9f31665447c8911517620762200d2245a2518d6e7208acc78cd9db317e21ad",
  dimensions: 384,
  pooling: "CLS",
  normalization: "L2",
  semanticThreshold: 0.5,
  queryInstruction: "Represent this sentence for searching relevant passages: ",
  rrfK: 60,
  minFusedScore: 1 / 61,
  bootstrap: { seed: 20260914, resamples: 10_000, confidence: 0.95 },
});
const METHODS = ["lexical", "semantic", "hybrid"];
const PRIMARY_METRICS = ["recallAt1", "recallAt3", "recallAt5", "reciprocalRank", "ndcgAt3", "precisionAt3"];
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
const round = (value) => typeof value === "number" ? Number(value.toFixed(9)) : value;
const stable = (value) => {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === "object") return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stable(value[key])]));
  return round(value);
};
const serialize = (value) => JSON.stringify(stable(value), null, 2) + "\n";

async function atomicWrite(path, value) {
  const temporary = `${path}.partial`;
  await writeFile(temporary, serialize(value), { encoding: "utf8", flag: "wx" });
  await rename(temporary, path);
}

const supportedRetrieverFilters = (filters = {}) => Object.fromEntries(
  Object.entries(filters).filter(([key]) => ["service", "category", "product", "language", "approvalStatus"].includes(key)),
);
const matchesAllFilters = (result, filters = {}) => Object.entries(filters).every(
  ([key, value]) => String(result.metadata?.[key] ?? "").toLocaleLowerCase("en-US") === String(value).toLocaleLowerCase("en-US"),
);

function parseArgs(argv) {
  const args = Object.fromEntries(argv.map((entry) => {
    const [key, ...parts] = entry.replace(/^--/, "").split("=");
    return [key, parts.join("=") || true];
  }));
  if (args.execute !== "frozen-v1.0.1" || !args.python || !args.cache || !args.output || !/^[0-9a-f]{40}$/.test(String(args.preexecutionCommit)))
    throw new Error("explicit frozen execution arguments and a 40-character pre-execution commit are required");
  return args;
}

async function createCanonicalD1(webRoot) {
  const output = await build({ entryPoints: [join(webRoot, "worker", "index.ts")], bundle: true, write: false, format: "esm", platform: "browser" });
  const persistence = await mkdtemp(join(tmpdir(), "deskpilot-challenge-"));
  const origin = "http://localhost";
  const mf = new Miniflare(convertV4MiniflareOptions({ modules: true, script: output.outputFiles[0].text,
    compatibilityDate: "2026-09-09", bindings: { APP_ENV: "local", LOCAL_DEV_IDENTITY: "enabled" },
    serviceBindings: { ASSETS: () => new Response("") }, d1Databases: { DB: "challenge-db" }, resourcePersistencePath: persistence }));
  const db = await mf.getD1Database("DB");
  for (const name of (await readdir(join(webRoot, "migrations"))).filter((x) => x.endsWith(".sql")).sort())
    await db.exec((await readFile(join(webRoot, "migrations", name), "utf8")).replace(/^--.*$/gm, "").replaceAll("\n", " "));
  await db.exec((await readFile(join(webRoot, "knowledge-seed.sql"), "utf8")).replace(/^--.*$/gm, "").replaceAll("\n", " "));
  return {
    retriever: { async retrieve(input) {
      const boundedInput = { ...input, topK: Math.min(input.topK ?? 3, 10) };
      const response = await mf.dispatchFetch(`${origin}/api/knowledge/retrieve`, { method: "POST",
        headers: { "Content-Type": "application/json", Origin: origin }, body: JSON.stringify(boundedInput) });
      if (!response.ok) throw new Error(`canonical D1 request failed: ${response.status}`);
      return (await response.json()).results;
    } },
    close: async () => { await mf.dispose(); await rm(persistence, { recursive: true, force: true }); },
  };
}

const sanitizedResult = (result) => ({
  documentId: result.documentId,
  chunkId: result.chunkId,
  score: round(result.score),
  citation: { documentId: result.citation?.documentId, chunkId: result.citation?.chunkId, label: result.citation?.label },
  metadata: Object.fromEntries(["service", "category", "product", "operatingSystem", "language", "sourceType", "approvalStatus", "version"]
    .filter((key) => result.metadata?.[key] !== undefined).map((key) => [key, result.metadata[key]])),
});

async function timedRetrieve(retriever, input, evaluationFilters) {
  const started = performance.now();
  const raw = await retriever.retrieve({ ...input, topK: 10 });
  const latencyMs = performance.now() - started;
  // Exact evaluator-side enforcement covers frozen metadata fields that are not
  // part of the production RetrievalQuery type, without changing relative rank.
  const documents = collapseToDocuments(raw).filter((item) => matchesAllFilters(item, evaluationFilters)).slice(0, 5).map(sanitizedResult);
  return { results: documents, abstained: documents.length === 0, latencyMs: round(latencyMs) };
}

function percentile(values, quantile) {
  if (!values.length) return 0;
  const ordered = [...values].sort((a, b) => a - b);
  return ordered[Math.ceil(quantile * ordered.length) - 1];
}

function comparisons(metrics) {
  const output = {};
  for (const candidate of ["semantic", "hybrid"]) {
    output[`${candidate}_minus_lexical`] = {};
    for (const metric of PRIMARY_METRICS) {
      output[`${candidate}_minus_lexical`][metric] = pairedBootstrapDifference(
        metrics.lexical.perCase.filter((x) => x.applicableToRetrieval).map((x) => x[metric]),
        metrics[candidate].perCase.filter((x) => x.applicableToRetrieval).map((x) => x[metric]),
        CONTRACT.bootstrap,
      );
    }
  }
  return output;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const webRoot = resolve(new URL("..", import.meta.url).pathname.replace(/^\/(.:)/, "$1"));
  const repoRoot = resolve(webRoot, "..");
  const cache = resolve(String(args.cache));
  const cacheRelative = relative(repoRoot, cache);
  if (cache !== join(repoRoot, ".semantic-cache") || !cacheRelative)
    throw new Error("the reviewed repository-local semantic cache is required");
  const python = resolve(String(args.python));
  if (python !== join(repoRoot, ".semantic-venv", "Scripts", "python.exe"))
    throw new Error("the reviewed isolated semantic Python is required");
  const outputPath = resolve(String(args.output));
  if (outputPath !== join(repoRoot, "docs", "evaluations", "retrieval-challenge-v1-results.json"))
    throw new Error("the dedicated immutable result path is required");
  for (const path of [outputPath, `${outputPath}.partial`]) {
    try { await access(path); throw new Error("result artifact path already exists"); } catch (error) { if (error?.code !== "ENOENT") throw error; }
  }
  const currentCommit = execFileSync("git", ["rev-parse", "HEAD"], { cwd: repoRoot, encoding: "utf8", windowsHide: true }).trim();
  if (currentCommit !== args.preexecutionCommit) throw new Error("HEAD differs from the authorized pre-execution commit");
  const challengePath = join(webRoot, "tests", "retrieval-challenge-v1.json");
  const challengeBytes = await readFile(challengePath);
  if (sha256(challengeBytes) !== CONTRACT.challengeSha256) throw new Error("challenge digest mismatch");
  const challenge = JSON.parse(challengeBytes.toString("utf8"));
  if (challenge.datasetVersion !== CONTRACT.challengeVersion || challenge.cases?.length !== 80) throw new Error("challenge contract mismatch");
  const modelPath = join(cache, "model", "model.safetensors");
  if (sha256(await readFile(modelPath)) !== CONTRACT.modelSha256) throw new Error("model digest mismatch");
  const modules = JSON.parse(await readFile(join(cache, "model", "modules.json"), "utf8"));
  const pooling = JSON.parse(await readFile(join(cache, "model", "1_Pooling", "config.json"), "utf8"));
  if (modules?.[1]?.type !== "sentence_transformers.models.Pooling" || modules?.[2]?.type !== "sentence_transformers.models.Normalize" ||
      pooling.word_embedding_dimension !== CONTRACT.dimensions || pooling.pooling_mode_cls_token !== true ||
      ["pooling_mode_mean_tokens", "pooling_mode_max_tokens", "pooling_mode_mean_sqrt_len_tokens", "pooling_mode_weightedmean_tokens", "pooling_mode_lasttoken"].some((key) => pooling[key] === true))
    throw new Error("model pooling/normalization contract mismatch");
  const corpusBytes = await readFile(join(webRoot, "shared", "knowledge.json"));
  const seedBytes = await readFile(join(webRoot, "knowledge-seed.sql"));
  const corpus = JSON.parse(corpusBytes.toString("utf8"));
  const d1 = await createCanonicalD1(webRoot);
  let provider;
  let primaryStarted = false;
  const evidence = { schemaVersion: 1, status: "running", preexecutionCommit: currentCommit, contract: CONTRACT,
    challenge: { version: challenge.datasetVersion, sha256: sha256(challengeBytes), cases: challenge.cases.length },
    corpus: { identity: "web/shared/knowledge.json", sha256: sha256(corpusBytes), d1SeedSha256: sha256(seedBytes), documents: corpus.documents.length, chunks: corpus.chunks.length },
    methods: {}, completedRetrievals: 0 };
  try {
    provider = new BgeLocalProvider({ python, modelDir: join(cache, "model"), cwd: repoRoot,
      env: { HF_HOME: cache, HF_HUB_OFFLINE: "1", TRANSFORMERS_OFFLINE: "1", HF_DATASETS_OFFLINE: "1", HF_HUB_DISABLE_TELEMETRY: "1" } });
    const model = await provider.metadata();
    if (model.modelId !== CONTRACT.modelId || model.revision !== CONTRACT.modelRevision || model.dimensions !== CONTRACT.dimensions ||
        model.pooling?.pooling_mode_cls_token !== true)
      throw new Error("runtime model contract mismatch");
    evidence.model = { modelId: model.modelId, revision: model.revision, dimensions: model.dimensions,
      normalization: model.normalization, pooling: model.pooling, maxSequenceLength: model.maxSequenceLength,
      packages: model.packages, safetensorsSha256: CONTRACT.modelSha256 };
    const lexical = d1.retriever;
    const semantic = new SemanticRetriever(corpus, provider, { dimensions: CONTRACT.dimensions,
      minScore: CONTRACT.semanticThreshold, queryTransform: (query) => CONTRACT.queryInstruction + query });
    const hybrid = new HybridRetriever(lexical, semantic, { rrfK: CONTRACT.rrfK, minFusedScore: CONTRACT.minFusedScore });
    const retrievers = { lexical, semantic, hybrid };
    const warmInput = { query: "general service desk knowledge", filters: {}, minScore: CONTRACT.semanticThreshold, semanticMinScore: CONTRACT.semanticThreshold };
    for (const method of METHODS) await retrievers[method].retrieve({ ...warmInput, topK: 10 });
    for (const method of METHODS) {
      const runs = [];
      for (const item of challenge.cases) {
        primaryStarted = true;
        const run = await timedRetrieve(retrievers[method], { query: item.query, filters: supportedRetrieverFilters(item.metadataFilters),
          minScore: CONTRACT.semanticThreshold, semanticMinScore: CONTRACT.semanticThreshold }, item.metadataFilters);
        runs.push({ caseId: item.caseId, ...run });
        evidence.completedRetrievals++;
      }
      evidence.methods[method] = { runs, warmLatencyMs: { p50: round(percentile(runs.map((x) => x.latencyMs), 0.5)), p95: round(percentile(runs.map((x) => x.latencyMs), 0.95)), label: "local warm CPU; non-production" } };
    }
    const metrics = Object.fromEntries(METHODS.map((method) => [method, calculateChallengeMetrics(challenge.cases, evidence.methods[method].runs, corpus)]));
    evidence.metrics = metrics;
    evidence.pairedDifferences = comparisons(metrics);
    evidence.status = "valid";
    await atomicWrite(outputPath, evidence);
  } catch (error) {
    evidence.status = primaryStarted ? "invalid" : "environment-failure-before-retrieval";
    evidence.failure = { code: primaryStarted ? "PRIMARY_EXECUTION_FAILED" : "PRE_RETRIEVAL_ENVIRONMENT_FAILED" };
    await atomicWrite(outputPath, evidence);
    throw error;
  } finally {
    await provider?.close();
    await d1.close();
  }
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(new URL(import.meta.url).pathname.replace(/^\/(.:)/, "$1")))
  await main();

export { CONTRACT, comparisons, matchesAllFilters, parseArgs, serialize, supportedRetrieverFilters };
