# DeskPilot independent retrieval challenge v1.0.1 results

- First-run validity: valid.
- Independent recalculation: identical.
- Immutable pre-execution commit: `c2b613121a386e70a43b85139ea4d372c5134de6`.
- Challenge SHA-256: `80fe584390415a90a068c6b7b7a2023790985b457798b0991a5d50843f470ec5`.
- Corpus: `web/shared/knowledge.json`, SHA-256 `7f96bf6c5a7c51fe917f38f1f29901a845201206d1110f5ae60ab9544f50ab94`; D1 seed SHA-256 `51a9b6a2265fbda7701cbb2e31d91a7ec0d8fad84bb67fec035458eb5fe9ca16`.
- Model: `BAAI/bge-small-en-v1.5@5c38ec7c405ec4b44b94cc5a9bb96e735b38267a`; safetensors SHA-256 `3c9f31665447c8911517620762200d2245a2518d6e7208acc78cd9db317e21ad`; 384 dimensions, CLS pooling, L2 normalization.

Frozen configurations: canonical local D1 FTS5 at threshold 0.50; instructed BGE semantic at threshold 0.50; guarded hybrid with the same semantic contract and committed bounded RRF k=60/minimum 1/61. No challenge-driven alternatives were evaluated.

The immutable pre-execution commit passed CI before execution. Production authenticated D1 FTS5, authentication, authorization, deterministic policy behavior, Worker code, Wrangler, migrations, and v1.2.0 were unchanged.

## Overall metrics

| Method | R@1 | R@3 | R@5 | MRR | nDCG@3 | P@3 | Abstain P/R/F1 | Warm p50/p95 ms |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| lexical | 0.903 | 0.986 | 0.986 | 0.983 | 0.977 | 0.377 | 1.000 / 1.000 / 1.000 | 8.258 / 10.982 |
| semantic | 0.802 | 0.959 | 0.959 | 0.928 | 0.928 | 0.362 | 1.000 / 0.818 / 0.900 | 33.486 / 70.377 |
| hybrid | 0.845 | 0.973 | 0.981 | 0.952 | 0.948 | 0.367 | 1.000 / 0.818 / 0.900 | 40.167 / 58.526 |

Local warm CPU latency is non-production.

## Category metrics

### adversarial_injection

| Method | R@1 | R@3 | R@5 | MRR | nDCG@3 | P@3 | Abstain P/R/F1 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| lexical | 0.944 | 0.944 | 0.944 | 1.000 | 0.976 | 0.333 | 1.000 / 1.000 / 1.000 |
| semantic | 0.833 | 0.944 | 0.944 | 0.944 | 0.944 | 0.333 | 1.000 / 1.000 / 1.000 |
| hybrid | 0.833 | 0.944 | 0.944 | 0.926 | 0.919 | 0.333 | 1.000 / 1.000 / 1.000 |

### ambiguous_multi_intent

| Method | R@1 | R@3 | R@5 | MRR | nDCG@3 | P@3 | Abstain P/R/F1 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| lexical | 0.483 | 0.950 | 0.950 | 0.950 | 0.918 | 0.633 | 0.000 / 0.000 / 0.000 |
| semantic | 0.383 | 0.867 | 0.867 | 0.900 | 0.843 | 0.567 | 0.000 / 0.000 / 0.000 |
| hybrid | 0.383 | 0.867 | 0.917 | 0.900 | 0.848 | 0.567 | 0.000 / 0.000 / 0.000 |

### irrelevant_abstain

| Method | R@1 | R@3 | R@5 | MRR | nDCG@3 | P@3 | Abstain P/R/F1 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| lexical | 0.000 | 0.000 | 0.000 | 0.000 | 0.000 | 0.000 | 1.000 / 1.000 / 1.000 |
| semantic | 0.000 | 0.000 | 0.000 | 0.000 | 0.000 | 0.000 | 1.000 / 0.800 / 0.889 |
| hybrid | 0.000 | 0.000 | 0.000 | 0.000 | 0.000 | 0.000 | 1.000 / 0.800 / 0.889 |

### metadata_filter

| Method | R@1 | R@3 | R@5 | MRR | nDCG@3 | P@3 | Abstain P/R/F1 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| lexical | 1.000 | 1.000 | 1.000 | 1.000 | 1.000 | 0.333 | 0.000 / 0.000 / 0.000 |
| semantic | 1.000 | 1.000 | 1.000 | 1.000 | 1.000 | 0.333 | 0.000 / 0.000 / 0.000 |
| hybrid | 1.000 | 1.000 | 1.000 | 1.000 | 1.000 | 0.333 | 0.000 / 0.000 / 0.000 |

### noisy_non_native

| Method | R@1 | R@3 | R@5 | MRR | nDCG@3 | P@3 | Abstain P/R/F1 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| lexical | 1.000 | 1.000 | 1.000 | 1.000 | 0.993 | 0.333 | 0.000 / 0.000 / 0.000 |
| semantic | 1.000 | 1.000 | 1.000 | 1.000 | 0.993 | 0.333 | 0.000 / 0.000 / 0.000 |
| hybrid | 1.000 | 1.000 | 1.000 | 1.000 | 0.993 | 0.333 | 0.000 / 0.000 / 0.000 |

### paraphrase_synonym

| Method | R@1 | R@3 | R@5 | MRR | nDCG@3 | P@3 | Abstain P/R/F1 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| lexical | 0.938 | 1.000 | 1.000 | 0.958 | 0.969 | 0.333 | 0.000 / 0.000 / 0.000 |
| semantic | 0.688 | 1.000 | 1.000 | 0.844 | 0.885 | 0.333 | 0.000 / 0.000 / 0.000 |
| hybrid | 0.875 | 1.000 | 1.000 | 0.938 | 0.954 | 0.333 | 0.000 / 0.000 / 0.000 |

### terse_ticket

| Method | R@1 | R@3 | R@5 | MRR | nDCG@3 | P@3 | Abstain P/R/F1 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| lexical | 1.000 | 1.000 | 1.000 | 1.000 | 1.000 | 0.333 | 0.000 / 0.000 / 0.000 |
| semantic | 0.917 | 0.917 | 0.917 | 0.917 | 0.917 | 0.306 | 0.000 / 0.000 / 0.000 |
| hybrid | 0.917 | 1.000 | 1.000 | 0.944 | 0.958 | 0.333 | 0.000 / 0.000 / 0.000 |

## Paired improvements and 95% intervals

### hybrid_minus_lexical

| Metric | Difference | 95% interval |
| --- | ---: | ---: |
| ndcgAt3 | -0.028 | [-0.058, -0.003] |
| precisionAt3 | -0.010 | [-0.024, 0.000] |
| recallAt1 | -0.058 | [-0.116, -0.014] |
| recallAt3 | -0.012 | [-0.031, 0.000] |
| recallAt5 | -0.005 | [-0.014, 0.000] |
| reciprocalRank | -0.031 | [-0.068, -0.002] |

### semantic_minus_lexical

| Metric | Difference | 95% interval |
| --- | ---: | ---: |
| ndcgAt3 | -0.049 | [-0.091, -0.015] |
| precisionAt3 | -0.014 | [-0.034, 0.000] |
| recallAt1 | -0.101 | [-0.174, -0.043] |
| recallAt3 | -0.027 | [-0.065, 0.000] |
| recallAt5 | -0.027 | [-0.065, 0.000] |
| reciprocalRank | -0.056 | [-0.101, -0.017] |

## Validation

- lexical: abstention TP/FP/FN/TN 11/0/0/69; invalid citations 0; duplicate document identities 0; approved-only 1.000; metadata-filter 1.000.
- semantic: abstention TP/FP/FN/TN 9/0/2/69; invalid citations 0; duplicate document identities 0; approved-only 1.000; metadata-filter 1.000.
- hybrid: abstention TP/FP/FN/TN 9/0/2/69; invalid citations 0; duplicate document identities 0; approved-only 1.000; metadata-filter 1.000.

## Promotion decision

**FAIL for architectural planning only; production deployment is not authorized.**

Paraphrase/synonym hybrid R@3 changed by 0.000; top-3 error reduction was 0.000. Policy gate: pass. Abstention non-regression gate: fail.

This is a valid negative result: under the frozen challenge contract, canonical
D1 FTS5 lexical retrieval outperformed both instructed BGE semantic retrieval
and the frozen hybrid configuration on the overall metrics. The preregistered
promotion gate therefore failed, and production should remain on D1 FTS5. No
post-challenge tuning, threshold selection, fusion adjustment, or derived
configuration may use challenge v1 results; any later experiment requires a new
independent challenge and preregistration.

## Limitations

The challenge is synthetic, English-only, small, and grounded in ten compact portfolio documents. Its result does not establish universal lexical superiority over semantic or hybrid retrieval. Document metrics collapse each method's frozen ten-chunk output before evaluation top-K, so a document below that candidate cap is unobserved. Document-level judgments do not establish chunk-level relevance. Exact operating-system and source-type filters are enforced by an evaluation adapter because those fields are outside the production query type. Local CPU latency is not a production benchmark. Passing cannot establish production quality, downstream generation safety, or deployment readiness.
