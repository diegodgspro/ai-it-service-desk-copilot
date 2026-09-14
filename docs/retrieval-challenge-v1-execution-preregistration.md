# DeskPilot challenge v1.0.1 execution preregistration

This record freezes the first independent execution configuration before any
retrieval result is produced. The runner must fail closed if the challenge or
model digest differs. No configuration search or rerun is authorized.

## Immutable inputs and retrieval configurations

- Challenge: `web/tests/retrieval-challenge-v1.json`, version `1.0.1`, 80 cases,
  SHA-256 `80fe584390415a90a068c6b7b7a2023790985b457798b0991a5d50843f470ec5`.
- Lexical: canonical local D1 FTS5 through the bundled Worker and committed
  migrations/seed; threshold `0.50`.
- Semantic: `BAAI/bge-small-en-v1.5` at revision
  `5c38ec7c405ec4b44b94cc5a9bb96e735b38267a`; `model.safetensors` SHA-256
  `3c9f31665447c8911517620762200d2245a2518d6e7208acc78cd9db317e21ad`;
  384 dimensions; CLS pooling; L2 normalization; threshold `0.50`; official
  query instruction enabled only for queries.
- Hybrid: the same semantic contract and canonical D1 lexical input, with the
  committed bounded RRF configuration `k=60` and minimum fused score `1/61`.
- Exact metadata constraints unsupported by the production query type
  (`operatingSystem` and `sourceType`) are enforced generically after candidate
  retrieval while preserving candidate order. This evaluation adapter does not
  change production code.

## Metrics and uncertainty

The unit is stable document identity. Candidate chunks are collapsed before
evaluation top-K, retaining the highest-ranked chunk from each method's frozen
ten-chunk output cap. Existing retrievers provide stable
score/document/chunk tie-breaking. Grades 2–3 define binary relevance for
Recall and Precision. nDCG@3 uses adjudicated grades with gain `2^grade - 1`.
Chunk citations are validated independently; no chunk-level gold claim is made.

Report Recall@1/3/5, MRR, nDCG@3, Precision@3, abstention precision/recall/F1
and confusion counts, invalid citations, duplicate document identities,
approved-only correctness, metadata-filter correctness, all seven categories,
and local warm p50/p95 labeled non-production.

Paired percentile bootstrap intervals use seed `20260914`, exactly 10,000
paired case resamples, and 95% intervals. Differences are candidate minus
canonical D1 for Recall@1/3/5, reciprocal rank, nDCG@3, and Precision@3. No
bootstrap parameter may change after results are observed.

## Execution and artifact rules

The local model must be loaded from the verified ignored cache with Hugging Face
and Transformers offline modes enabled. The runner performs one measured call
per method and challenge case after a neutral non-challenge warm-up. Reports
contain no timestamps, user identity, credentials, absolute/cache paths, or
environment values. Scores are rounded deterministically and JSON keys are
sorted. A failure before any challenge result is an environment failure and is
not a primary run; a failure after any result marks the primary run invalid and
forbids an unreviewed rerun.

The promotion gate is the one in the frozen challenge protocol. Passing permits
architectural planning only, never deployment. Production authenticated D1
FTS5, authorization, migrations, Wrangler configuration, and release v1.2.0
remain unchanged.
