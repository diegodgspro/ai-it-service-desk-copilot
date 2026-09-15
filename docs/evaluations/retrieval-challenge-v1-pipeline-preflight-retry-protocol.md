# DeskPilot challenge v1.0.1 pipeline-preflight retry protocol

Attempt 1 failed during the canonical D1 warm-up because a shared runner object
forwarded `semanticMinScore` to the strict lexical API. The D1 validator
correctly rejected it. The sanitized evidence is immutable in commit
`3f0c1a4bd14bf767eeeab66c68aa1aec04233535`, with SHA-256
`0727ecc85dfdcbbc60625fbc1b6579416ca447bc705f1daf1a16fde4d29a3065`.
No challenge query or label was processed, zero challenge retrievals completed,
primary run 1 did not start, and no metric, comparison, or tuning occurred.

## Frozen evaluation contract

- Challenge `1.0.1`, SHA-256
  `80fe584390415a90a068c6b7b7a2023790985b457798b0991a5d50843f470ec5`.
- Canonical D1 FTS5 lexical `minScore` `0.50`; instructed BGE semantic
  `semanticMinScore` `0.50`.
- Query instruction `Represent this sentence for searching relevant passages: `.
- Model `BAAI/bge-small-en-v1.5`, revision
  `5c38ec7c405ec4b44b94cc5a9bb96e735b38267a`, safetensors SHA-256
  `3c9f31665447c8911517620762200d2245a2518d6e7208acc78cd9db317e21ad`.
- CLS pooling, 384 dimensions, L2 normalization.
- Bounded RRF `k=60`, minimum fused score `1/61`.
- Recall@1/3/5, Precision@3, reciprocal rank, nDCG@3, abstention,
  citation/identity/policy checks, and paired deterministic bootstrap seed
  `20260914`, `10,000` resamples, `0.95` confidence.

## Only permitted correction

The runner must construct independent allowlisted requests. Lexical is exactly
`query`, supported `filters`, `topK`, and lexical `minScore`. Semantic is
`query`, supported `filters`, `topK`, `semanticMinScore`, and bounded
timeout/cancellation data. Fusion receives already-produced provider results,
an allowlisted query/filter/top-K view, and the frozen RRF configuration. No
shared options object may be spread into a provider request. Thresholds may not
be renamed, aliased, or reused across boundaries.

The strict D1 validator and all Worker production code, authentication,
authorization, approved-only enforcement, filtering behavior, migrations, and
deployment configuration remain unchanged. Unknown lexical fields must continue
to fail closed. Contract expansion and challenge-driven tuning are prohibited.

## Challenge-blind preflight and execution gate

Before challenge execution, the full pipeline runs on a separate toy corpus and
fresh local toy D1 database using unrelated text: canonical FTS5, the verified
offline BGE provider, hybrid fusion, document collapse, all frozen metrics,
abstention, deterministic bootstrap, stable JSON/Markdown artifacts, and an
independent metric recalculation. It verifies request schemas, semantic
timeout/fallback, filters, citations, duplicate identities, sanitization, and
byte stability. The toy script contains no challenge import or path.

During preflight, challenge access is restricted to byte size and SHA-256; its
bytes must not be decoded or parsed. The new checkpoint must pass every local
gate and GitHub Actions. Only then may its exact commit be supplied to the
one-shot runner. The first processed challenge query starts primary run 1. A
failure after that point invalidates the run and forbids retry. Results cannot
be used to alter configuration or trigger a rerun.
