// Offline model-only preflight. This file must never read the challenge dataset.
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { BgeLocalProvider } from "./bge-local-provider.mjs";
import { CONTRACT, assertDiskPoolingContract, assertModelModuleContract,
  assertRuntimeModelContract } from "./run-retrieval-challenge-v1.mjs";

const repoRoot = resolve(new URL("../..", import.meta.url).pathname.replace(/^\/(.:)/, "$1"));
const modelDir = resolve(repoRoot, ".semantic-cache", "model");
const python = resolve(repoRoot, ".semantic-venv", "Scripts", "python.exe");
const digest = createHash("sha256").update(await readFile(resolve(modelDir, "model.safetensors"))).digest("hex");
if (digest !== CONTRACT.modelSha256) throw new Error("model.safetensors digest mismatch");
assertModelModuleContract(JSON.parse(await readFile(resolve(modelDir, "modules.json"), "utf8")));
assertDiskPoolingContract(JSON.parse(await readFile(resolve(modelDir, "1_Pooling", "config.json"), "utf8")));

const provider = new BgeLocalProvider({ python, modelDir, cwd: repoRoot, env: {
  HF_HOME: resolve(repoRoot, ".semantic-cache"), HF_HUB_OFFLINE: "1", TRANSFORMERS_OFFLINE: "1",
  HF_DATASETS_OFFLINE: "1", HF_HUB_DISABLE_TELEMETRY: "1",
} });
try {
  const metadata = await provider.metadata();
  assertRuntimeModelContract(metadata);
  const toySentence = "A small blue notebook rests beside a ceramic cup.";
  const [first] = await provider.embed([toySentence]);
  const [second] = await provider.embed([toySentence]);
  if (first.length !== CONTRACT.dimensions || second.length !== CONTRACT.dimensions) throw new Error("embedding dimension mismatch");
  if (!first.every(Number.isFinite) || !second.every(Number.isFinite)) throw new Error("non-finite embedding value");
  const norm = Math.sqrt(first.reduce((sum, value) => sum + value * value, 0));
  if (Math.abs(norm - 1) > 1e-6) throw new Error("embedding is not L2-normalized");
  if (first.some((value, index) => value !== second[index])) throw new Error("repeated embedding is not deterministic");
  console.log(JSON.stringify({ modelId: metadata.modelId, revision: metadata.revision, safetensorsSha256: digest,
    pooling: metadata.pooling, dimensions: first.length, finite: true, l2Norm: norm, deterministic: true,
    offline: true, trustRemoteCode: false, useSafetensors: true }));
} finally {
  await provider.close();
}
