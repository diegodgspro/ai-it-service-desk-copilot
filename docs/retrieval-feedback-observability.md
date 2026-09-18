# Retrieval Feedback & Observability

Status: v1.4.0 Operational Maturity changes are implemented on a feature branch for review; not deployed. v1.3.0 remains the stable release and production remains unchanged.

## Architecture and contract

`POST /api/knowledge/retrieve` remains the canonical approved-only D1 FTS5 lexical retrieval. It now records an opaque retrieval ID, actor hash, optional incident/version/analysis context, lexical mode, result/filter counts, abstention and the document/chunk identifiers displayed. It stores no query, ticket description or evidence text.

`POST /api/knowledge/feedback` requires Auth0, server-side `write`, exact same origin, JSON and at most 16 KiB measured as UTF-8 bytes. The body contains a client event ID, retrieval/document/chunk IDs, stable citation, document version/hash, one outcome (`helpful` or `not_helpful`), its compatible structured reason and an optional event being corrected. Unknown fields—including actor, subject, email, permissions and timestamps—are rejected. The Worker verifies that the same authenticated actor received the evidence, the document/chunk pair remains approved, and the citation/version/hash match D1. Identity and time are server-derived. Retries are idempotent; corrections append and link a new event.

`GET /api/knowledge/feedback/summary` requires the existing server-side `write` permission. It rejects every query parameter, including filters, cursors and limits, with the same generic validation response. Fewer than five current valid assessments returns exactly `{"status":"insufficient_sample"}`: no count, coverage, retrieved count, percentage, groups or individual data. Zero through four events produce the same response on repeated requests. Superseded events are excluded; corrections do not increase the current sample. A single SQL statement captures counts and coverage against one consistent D1 snapshot.

At five or more assessments the response is `status: "available"` plus global `retrievedEvidenceCount`, `evaluatedEvidenceCount`, `feedbackCoveragePercent` and `helpfulPercent`. Legacy `reasons` and `documents` arrays remain empty: subgroups and their complements could otherwise disclose smaller cohorts even when the global sample is large. No summary pagination or client-selected cohort exists. Clients must branch on `status` before reading metrics. The UI explicitly explains suppression and labels these metrics as human lab feedback, not accuracy or ground truth. Individual events, identity, Auth0 subject, email, permission maps, query, ticket description, evidence text and tokens are never returned.

The threshold protects small global samples and removes slicing/retry message differences. It is not differential privacy: longitudinal observations after the sample reaches five can reveal aggregate changes, and events are not guaranteed to represent five distinct people. No stronger anonymity claim is made.

Migration `0005_knowledge_feedback.sql` is additive, preserves migrations 0001–0004, uses foreign keys, checks, narrowly justified indexes and triggers that reject updates/deletes. It has not been applied remotely. Any destructive expiry or purge policy requires separate authorization.

## Interpretation and hard limits

Feedback is imperfect human laboratory feedback, not a gold label, accuracy measure or confirmed diagnosis. There is no online learning, fine-tuning, model download, semantic/hybrid promotion, automatic ranking or threshold adjustment, individual productivity monitoring, third-party data transfer, incident priority/status change, analysis mutation or automation execution. No feedback was used for tuning. The independent negative v1.0.1 challenge remains preserved and unchanged.

Structured logs use an allowlist: request/correlation ID, route, status, duration, result count, abstention, filter count, outcome and reason. They exclude authorization, cookies, tokens, Auth0 subject, email, permission maps, queries, ticket/evidence text and private configuration. No Logpush, Analytics Engine, extra binding, paid service or paid fallback is enabled.

Distributed rate limiting cannot be implemented reliably with the current bindings and remains an explicit limitation. Authentication, authorization, strict validation, byte limits, bounded aggregation and database idempotency reduce abuse but are not a distributed rate limiter.
