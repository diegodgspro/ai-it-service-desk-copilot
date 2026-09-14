# DeskPilot Independent Retrieval Challenge v1 protocol

Status: preregistered before case authoring. The challenge data is not an implementation test and must not be queried by any retrieval system during authoring or validation.

## Scope and independence

An independent QA/red-team author receives only the ten approved Markdown files in `knowledge_base/`, `web/tests/retrieval-challenge-v1.schema.json`, and the safety constraints in this protocol. Before freezing the data, that author must not inspect existing evaluation datasets, retrieval implementations, thresholds, fusion settings, model output, retrieval output, or prior metrics. Labels are human judgments grounded only in approved knowledge content.

The dataset contains exactly 80 fictional, synthetic English queries: 16 `paraphrase_synonym`, 12 `noisy_non_native`, 12 `terse_ticket`, 10 `ambiguous_multi_intent`, 10 `metadata_filter`, 10 `irrelevant_abstain`, and 10 `adversarial_injection`. All ten approved documents must occur in at least one positive relevance judgment. Existing golden, development, and final queries may be used only after authoring, by a separate validator, to reject reuse or near-reuse; they are never authoring input.

## Frozen schema and judgments

The normative schema is `web/tests/retrieval-challenge-v1.schema.json`. Case IDs are `irc-v1-001` through `irc-v1-080`. Relevance is graded independently for documents and, only when justified, chunks:

- `3`: direct evidence that fully addresses the information need;
- `2`: substantial evidence addressing a major part of the need;
- `1`: useful but incomplete or contextual evidence;
- `0`: not relevant (omitted from the stored relevance list).

Every acceptable document has grade 1–3 and appears in `acceptableDocumentIds`. A chunk label has grade 1–3, belongs to an acceptable document, and is included only when the corpus supports a defensible chunk-level judgment. Multi-intent and genuinely ambiguous cases may accept multiple documents; no artificial single gold answer is required.

`expectedAbstention` is true only when no approved passage supplies sufficiently relevant evidence (grade 2 or 3). Such cases have empty acceptable IDs and relevance labels. Non-abstention cases require at least one grade 2 or 3 label. Metadata filters use only exact corpus values for `service`, `category`, `product`, `operatingSystem`, `language`, `sourceType`, and `approvalStatus`; the expected documents must satisfy every supplied filter.

## Metrics reserved for the later evaluation

The later, separately authorized evaluation will report Recall@1, Recall@3, Recall@5, MRR, nDCG@3, Precision@3, abstention precision/recall/F1, incorrect-citation count, duplicate-identity count, approved-only correctness, metadata-filter correctness, latency p50/p95, and deterministic repeatability. No metric is generated in this phase. The evaluation unit is the stable document identity; outputs are deduplicated before the limit and all metrics. Grades 2 and 3 are relevant for binary metrics. Recall@K is relevant documents in the top K divided by all grade-2/3 documents for the case, Precision@3 uses three as its denominator, and MRR uses the rank of the first grade-2/3 document. nDCG@3 uses gain `2^grade - 1`, log2 rank discount, unjudged documents as grade 0, and the ideal ordering of all positively graded documents. Metrics are macro-averaged over applicable cases.

An abstention is an explicit abstain decision with no cited/retrieved answer evidence. Abstention precision, recall, and F1 treat `expectedAbstention` as the positive class. Grade 1 is contextual evidence and may accompany a grade-2/3 judgment but is not sufficient alone; v1 abstention cases intentionally store no contextual labels. Approved-only and metadata correctness are the fraction of applicable cases with no violating returned identity. Deterministic repeatability requires byte-equivalent ordered identities, scores after documented rounding, citations, and abstention decision across repeated runs with identical inputs.

A citation is valid only if its stable document/chunk identity exists in the frozen approved corpus, the chunk belongs to that document, and the cited identity is returned without mutation. Any fabricated, mismatched, unapproved, or nonexistent identity is invalid. Duplicate identities are collapsed by stable document/chunk identity before result limits; repeated excerpts do not define identity.

## Later promotion gate

Promotion remains gated on hybrid improving macro Recall@3 on the 16 `paraphrase_synonym` cases by at least 0.10 absolute or reducing top-3 retrieval errors by at least 30% relative to canonical local D1 FTS5. A top-3 retrieval error is a non-abstention case with no grade-2/3 document in the first three deduplicated identities, or an abstention case that returns answer evidence. The chosen alternative must be declared before examining results. Approved-only and metadata-filter correctness must remain 1.00; invalid or unstable citations and duplicate identities must be zero; abstention F1 may decline by no more than 0.02 absolute; semantic failures must safely fall back to lexical retrieval; authentication, authorization, and deterministic policy must not regress. For this local CPU experiment, warm p95 must be at most 200 ms per query, cold model-start p95 at most 15 seconds, and peak process memory at most 2 GiB; these are experimental feasibility limits, not Cloudflare production targets.

The challenge set is a final holdout. Thresholds, RRF/fusion parameters, query instructions, prompts, filters, and retrieval implementation must never be tuned against it. Looking at challenge results to select a configuration invalidates the comparison. A later harness may pass only `query` and `metadataFilters` to a retriever; acceptable IDs, relevance, rationale, difficulty, tags, category, and expected-abstention fields remain evaluator-only data.

## Safety and adversarial requirements

All names, organizations, systems, and identities are fictional. Queries contain no real company, employee, Auth0, Cloudflare, credential, secret, or private configuration. Adversarial cases cover attempts to bypass approved-only enforcement; change authorization or priority; approve automation; fabricate citations; suppress abstention; and obtain secrets or configuration. Query instructions never override authorization, approval, evidence, or abstention policy.

## Freeze and versioning

After independent authoring and review, the canonical JSON is serialized as UTF-8 without BOM, LF endings, two-space indentation, deterministic object/array order, and one trailing LF. The final SHA-256, case count, and category distribution are recorded in this document. Once marked frozen, any byte or label change requires a new dataset version and invalidates direct comparison with v1 results.

Freeze record:

- dataset: `web/tests/retrieval-challenge-v1.json`
- version: `1.0.1`
- status: frozen on 2026-09-13 after independent authoring, second blind annotation, and corpus-only adjudication
- canonical byte length: 58,176
- SHA-256: `80fe584390415a90a068c6b7b7a2023790985b457798b0991a5d50843f470ec5`
- cases: 80
- distribution: 16 paraphrase/synonym; 12 noisy, misspelled, or non-native English; 12 terse ticket; 10 ambiguous/multi-intent; 10 metadata-filter; 10 irrelevant/abstention; 10 adversarial/prompt-injection

The author used a fresh agent with no inherited conversation history. Its inputs were restricted to the ten `knowledge_base/*.md` files, the preregistered schema, and the synthetic/safety requirements. It was prohibited from reading prior evaluation data, retrieval implementations, thresholds, fusion configuration, outputs, metrics, or model/cache content. Corrections after structural review were limited to removing one invalid metadata value and making required adversarial families explicit; neither used retrieval behavior.

Version history:

- `1.0.0`: 57,599 bytes, SHA-256 `9a2386414fe230945ae3d18d05773fec196c48ff4aa7550ebac9d2867b2a868d`; initial independently authored freeze.
- `1.0.1`: second blind annotation and separate corpus-only adjudication changed labels/rationales in nine cases without changing queries, categories, filters, or abstention decisions. Direct comparison with results produced from `1.0.0` is invalid.

## Difficulty-only lexical overlap analysis

`scripts/analyze_challenge_overlap.py` measures only the fraction of unique query tokens occurring in the union of each case's human-labeled acceptable documents. It does not rank documents, call D1 FTS5, run a retrieval implementation, or alter cases. Abstention cases are excluded. The frozen results were:

| Category | Cases | Mean | Median | Minimum | Maximum |
| --- | ---: | ---: | ---: | ---: | ---: |
| adversarial/injection | 9 | 0.502 | 0.563 | 0.214 | 0.600 |
| ambiguous/multi-intent | 10 | 0.717 | 0.733 | 0.583 | 0.857 |
| metadata-filter | 10 | 0.561 | 0.523 | 0.455 | 0.727 |
| noisy/non-native | 12 | 0.478 | 0.436 | 0.200 | 0.800 |
| paraphrase/synonym | 16 | 0.403 | 0.400 | 0.182 | 0.643 |
| terse ticket | 12 | 0.825 | 0.900 | 0.500 | 1.000 |

There are 69 non-abstention cases and no zero-overlap gold cases. Lower overlap in paraphrase/synonym and noisy categories describes intended surface-form difficulty; it is not a retrieval score and was not used to edit the frozen cases.

## Limitations

The challenge is synthetic, English-only, small, and grounded in ten compact portfolio documents. Independent authoring reduces direct tuning leakage but does not provide multiple human annotators, adjudication statistics, real ticket prevalence, or production representativeness. Judgments are document-level because the author did not find chunk-level labels necessary; later evaluation must not reinterpret that absence as chunk irrelevance. Product names present in the approved synthetic corpus may be real trademarks, but no real organization, tenant, employee, credential, configuration, or operational data is included. Passing this challenge cannot by itself establish production quality or authorize semantic deployment.

The adversarial cases assess whether retrieval stays grounded in approved evidence or abstains. They do not prove that downstream generation, authorization, or automation refuses unsafe actions; those controls require separate policy and API tests. Because the corpus contains only approved records, the approved-only bypass case tests hostile query text rather than exclusion of an actual unapproved record. Encoded payloads, resource-exhaustion prompts, cross-tenant spoofing, conflicting filter injection, and explicit fabricated identity attacks remain outside v1.
