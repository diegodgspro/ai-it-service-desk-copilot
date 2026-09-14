import assert from "node:assert/strict";
import test from "node:test";
import {
  assertDiskPoolingContract,
  assertModelModuleContract,
  assertRuntimeModelContract,
} from "../scripts/run-retrieval-challenge-v1.mjs";

const modules = () => [
  { idx: 0, name: "0", path: "", type: "sentence_transformers.models.Transformer" },
  { idx: 1, name: "1", path: "1_Pooling", type: "sentence_transformers.models.Pooling" },
  { idx: 2, name: "2", path: "2_Normalize", type: "sentence_transformers.models.Normalize" },
];
const diskPooling = () => ({
  word_embedding_dimension: 384,
  pooling_mode_cls_token: true,
  pooling_mode_mean_tokens: false,
  pooling_mode_max_tokens: false,
  pooling_mode_mean_sqrt_len_tokens: false,
});
const runtimeModel = () => ({
  modelId: "BAAI/bge-small-en-v1.5",
  revision: "5c38ec7c405ec4b44b94cc5a9bb96e735b38267a",
  dimensions: 384,
  normalization: "SentenceTransformer.encode(normalize_embeddings=True)",
  pooling: { embedding_dimension: 384, pooling_mode: "cls", include_prompt: true },
});
const rejects = (fn, pattern = /contract mismatch/) => assert.throws(fn, pattern);

test("accepts the exact verified official module and legacy pooling metadata", () => {
  assert.doesNotThrow(() => assertModelModuleContract(modules()));
  assert.doesNotThrow(() => assertDiskPoolingContract(diskPooling()));
});

test("accepts only the verified normalized runtime CLS shape", () => {
  assert.doesNotThrow(() => assertRuntimeModelContract(runtimeModel()));
  for (const pooling_mode of ["mean", "cls ", "CLS", "unknown", ["cls"], ["cls", "mean"]])
    rejects(() => assertRuntimeModelContract({ ...runtimeModel(), pooling: { ...runtimeModel().pooling, pooling_mode } }));
});

test("rejects mean pooling and multiple active legacy modes", () => {
  rejects(() => assertDiskPoolingContract({ ...diskPooling(), pooling_mode_cls_token: false, pooling_mode_mean_tokens: true }));
  rejects(() => assertDiskPoolingContract({ ...diskPooling(), pooling_mode_mean_tokens: true }));
  rejects(() => assertDiskPoolingContract({ ...diskPooling(), pooling_mode_max_tokens: true }));
});

test("rejects wrong dimensions, missing, malformed, and unknown pooling values", () => {
  rejects(() => assertDiskPoolingContract({ ...diskPooling(), word_embedding_dimension: 768 }));
  rejects(() => assertDiskPoolingContract({ ...diskPooling(), word_embedding_dimension: "384" }));
  const missing = diskPooling(); delete missing.pooling_mode_mean_tokens;
  rejects(() => assertDiskPoolingContract(missing));
  rejects(() => assertDiskPoolingContract({ ...diskPooling(), pooling_mode_mean_tokens: "false" }));
  rejects(() => assertDiskPoolingContract({ ...diskPooling(), pooling_mode_weightedmean_tokens: false }));
  rejects(() => assertDiskPoolingContract(null));
  rejects(() => assertRuntimeModelContract({ ...runtimeModel(), pooling: { ...runtimeModel().pooling, embedding_dimension: 768 } }));
  rejects(() => assertRuntimeModelContract({ ...runtimeModel(), pooling: { ...runtimeModel().pooling, include_prompt: false } }));
  rejects(() => assertRuntimeModelContract({ ...runtimeModel(), pooling: { arbitrary: "cls" } }));
});

test("rejects unexpected, missing, duplicate, and malformed modules", () => {
  for (const mutate of [
    (value) => { value[1].path = "pooling"; },
    (value) => { value[1].type = "unknown.Pooling"; },
    (value) => { value[2].path = "Normalize"; },
    (value) => { value.pop(); },
    (value) => { value.push({ ...value[1], idx: 3, name: "3" }); },
    (value) => { value[1].extra = true; },
  ]) { const value = modules(); mutate(value); rejects(() => assertModelModuleContract(value)); }
  rejects(() => assertModelModuleContract({}));
});

test("malformed serialized metadata fails at the JSON parsing boundary", () => {
  assert.throws(() => JSON.parse('{"pooling_mode":"cls"'), SyntaxError);
});
