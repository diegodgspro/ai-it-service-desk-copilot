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

The later, separately authorized evaluation will report Recall@1, Recall@3, Recall@5, MRR, nDCG@3, Precision@3, abstention precision/recall/F1, incorrect-citation count, duplicate-identity count, approved-only correctness, metadata-filter correctness, latency p50/p95, and deterministic repeatability. No metric is generated in this phase.

A citation is valid only if its stable document/chunk identity exists in the frozen approved corpus, the chunk belongs to that document, and the cited identity is returned without mutation. Any fabricated, mismatched, unapproved, or nonexistent identity is invalid. Duplicate identities are collapsed by stable document/chunk identity before result limits; repeated excerpts do not define identity.

## Later promotion gate

Promotion remains gated on hybrid improving paraphrase/synonym performance by at least 10 percentage points or reducing retrieval errors by at least 30% versus canonical local D1 FTS5; approved-only and metadata-filter correctness must remain 1.00; invalid or unstable citations must be zero; irrelevant-query abstention must not materially regress; semantic failures must safely fall back to lexical retrieval; authentication, authorization, and deterministic policy must not regress; and experimental latency/resource use must be documented and acceptable.

The challenge set is a final holdout. Thresholds, RRF/fusion parameters, query instructions, prompts, filters, and retrieval implementation must never be tuned against it. Looking at challenge results to select a configuration invalidates the comparison.

## Safety and adversarial requirements

All names, organizations, systems, and identities are fictional. Queries contain no real company, employee, Auth0, Cloudflare, credential, secret, or private configuration. Adversarial cases cover attempts to bypass approved-only enforcement; change authorization or priority; approve automation; fabricate citations; suppress abstention; and obtain secrets or configuration. Query instructions never override authorization, approval, evidence, or abstention policy.

## Freeze and versioning

After independent authoring and review, the canonical JSON is serialized as UTF-8 without BOM, LF endings, two-space indentation, deterministic object/array order, and one trailing LF. The final SHA-256, case count, and category distribution are recorded in this document. Once marked frozen, any byte or label change requires a new dataset version and invalidates direct comparison with v1 results.

Freeze record: pending independent authoring and validation.
