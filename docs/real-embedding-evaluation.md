# Real BGE Small retrieval evaluation

This is an optional local experiment, not a production feature or release.
Production remains on authenticated D1 FTS5. No remote inference API,
Cloudflare AI service, Vectorize resource, deployment, migration, credential,
or generated embedding artifact is used or committed.

## Method

The frozen dataset contains 40 synthetic cases: 12 preserved golden cases, 12
development cases used only to select the semantic threshold, and 16 final
cases. The reported held-out set combines the unchanged 12 golden cases and 16
final cases; the development cases are excluded. Categories cover paraphrase,
synonym, ambiguity, irrelevance, metadata filters, adversarial text, duplicate
terms, and abstention. Document metrics count a document once even when several
of its chunks are returned. Chunk identity and citation validation remain
separate.

The lexical baseline invokes the authenticated Worker through local Miniflare
and D1 FTS5; it does not use the in-memory lexical fixture. Real semantic
passages contain title, heading, and chunk content with no query instruction.
Both raw queries and the official short-query instruction were evaluated. CLS
pooling, 384 dimensions, L2 normalization, CPU execution, and 512-token
truncation come from the reviewed model snapshot. Development-only tuning chose
a semantic minimum score of 0.50 for both query configurations.

Run from the repository root after the separately reviewed model acquisition:

```powershell
.\.semantic-venv\Scripts\python.exe -m pip check
.\.semantic-venv\Scripts\python.exe -m pip_audit --vulnerability-service osv
.\.tools\node-v22.23.2-win-x64\node.exe web\scripts\evaluate-real-retrieval.mjs --python=.semantic-venv\Scripts\python.exe --cache=.semantic-cache --compact
```

## Held-out results

| Configuration | R@1 | R@3 | R@5 | MRR | nDCG@3 | P@3 | Abstain P/R/F1 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Canonical D1 FTS5 | 0.810 | 0.857 | 0.857 | 0.833 | 0.840 | 0.302 | 0.700 / 1.000 / 0.824 |
| Semantic, raw query | 0.905 | 1.000 | 1.000 | 0.952 | 0.965 | 0.349 | 1.000 / 0.286 / 0.444 |
| Hybrid, raw query | 0.905 | 1.000 | 1.000 | 0.952 | 0.965 | 0.349 | 1.000 / 0.286 / 0.444 |
| Semantic, instructed query | 0.857 | 1.000 | 1.000 | 0.929 | 0.947 | 0.349 | 1.000 / 0.714 / 0.833 |
| Hybrid, instructed query | 0.905 | 0.952 | 0.952 | 0.929 | 0.935 | 0.333 | 1.000 / 0.714 / 0.833 |

All configurations had zero invalid citations, zero duplicate chunk identities,
1.00 approved-only correctness, 1.00 metadata-filter correctness, and 1.00
deterministic repeatability. The preserved lexical golden baseline remains
Recall@1 0.90, Recall@3 1.00, and MRR 0.95.

For the six held-out paraphrase/synonym cases, canonical D1 FTS5 Recall@3 was
0.50. Raw semantic and hybrid reached 1.00 but materially regressed abstention.
The instructed semantic result reached 1.00; instructed hybrid reached 0.833,
an improvement of 33.3 percentage points over lexical while retaining overall
abstention F1 (0.833 versus 0.824). The instructed query is therefore the only
configuration recommended for continued hybrid experimentation.

## Latency and resources

The machine used Windows 11, an Intel64 Family 6 Model 186 CPU with 12 logical
cores, CPython 3.13.15, and CPU-only PyTorch. Five independent cold model-load,
46-chunk-index, and first-query samples were 11.95, 12.36, 14.11, 14.90, and
17.20 seconds: cold p50 14.11 s and p95 17.20 s. A separate model-load-only
observation was 9.41 s.

Warm held-out p50/p95 observations were 11.99/16.16 ms for lexical,
45.24/199.97 ms for raw semantic, 42.02/82.23 ms for raw hybrid,
90.09/217.82 ms for instructed semantic, and 55.90/66.44 ms for instructed
hybrid. These small local samples showed CPU scheduling variance and are not a
production latency benchmark. Independent hybrid cold-start samples were not
collected; its cold path includes the same model/index cost plus local D1 work.

## Decision and limitations

The instructed hybrid configuration passes the narrow promotion criterion for
continued experimentation: paraphrase/synonym Recall@3 improved by more than 10
points, policy correctness stayed 1.00, citations were stable, and abstention
did not materially regress. This does not authorize production integration.
The dataset is small, synthetic, English-only, and authored from the same
support domains as the corpus. Threshold selection used only 12 development
cases, latency samples are limited, and no independent human relevance review
was performed. Continue experimenting; do not promote to production yet.
