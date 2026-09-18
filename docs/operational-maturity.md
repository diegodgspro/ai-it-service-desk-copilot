# Operational maturity — v1.4.0 delivery A

Status: unreleased branch work. Stable v1.3.0 is tagged at `15ac9d538831a4257a9ca5d36b758cef9bcbff57`. No remote migration, deployment, merge, tag, release, Auth0, billing or external-service configuration change is authorized in this delivery.

## Pagination contract

All operational collections are bounded: 20 records by default, maximum 50. Queue endpoints accept only a single `limit` and/or `cursor`; audit and analysis collections follow the same rule. Unknown filters, duplicate parameters, zero, negative and excessive limits receive sanitized 400 responses. Existing retrieval already limits results to ten; feedback summary has one global result and rejects every query parameter. There is no individual-feedback listing or new export endpoint.

The existing `GET /api/tickets` remains a ticket array and exposes an optional `X-Next-Cursor` header. The UI uses `GET /api/tickets/page`, returning `{items,nextCursor}`. Both represent the same logical queue and accept the same cursor. `GET /api/tickets/:id/audit` and `/analyses` use the same envelope with independent incident/collection scopes. Detail retains `{ticket,audit}` and adds `auditNextCursor`; embedded audit is bounded to 20. A null cursor means the end. Clients treat cursors as opaque, preserve them exactly and never derive authorization from their contents.

The Worker validates HMAC-SHA256, canonical base64url, payload shape, integer bounds, authenticated actor hash, collection scope, fixed page size and one-hour expiry. Tokens are capped at 1024 ASCII characters. Every page reauthorizes the authenticated subject using current server grants. Client identity, timestamps and permission claims do not authorize reads. Expired, forged and incompatible cursors all return `{"error":"Invalid pagination request."}` with status 400 and no-store caching; refresh restarts navigation. Replaying a valid cursor is read-only and deterministic for membership.

Queue order remains `id ASC`; an initial maximum rowid excludes later inserts even when a new ticket sorts before or after the current position. Audit/history use `id DESC` with an initial maximum ID. Cursor pages select one extra row to detect continuation, without an unbounded count. Indexed seeks avoid offset scans. Existing tables have no API deletion or ID mutation. The watermark freezes membership, not editable ticket fields: later pages show current status/title. This is not database-wide MVCC. External maintenance that rewrites rowids must invalidate cursors first; a large number of post-watermark inserts may increase rows examined. No such maintenance runs here.

UI search and totals describe loaded incidents, not a global query. Load more keeps earlier items; Refresh queue starts a new snapshot. Loading, empty, error/retry and keyboard focus states are explicit. An expired cursor can be recovered by refreshing that collection. No automatic retry loop accumulates D1 work.

## Append-only analyses

`0006_operational_maturity.sql` adds `analysis_history`, its `(ticket_id,id)` index, update/delete rejection triggers, and a private singleton `pagination_key` initialized with 32 random bytes in D1. No additional binding, external service or dependency is required. Earlier migrations and content artifacts are untouched.

Every successful new analysis writes one snapshot in the same D1 batch as the optimistic ticket update and audit. `changes()=1` gates each insert; conflicts create neither history nor audit, and any failure rolls back the batch. Snapshot fields are `analysis_id`, `ticket_id`, resulting `incident_version`, `schema_version=1`, authenticated `actor`, D1 `created_at`, and immutable JSON analysis/evidence. The API parses JSON into `analysis` and `evidence`. It includes no tokens, permission maps or Auth0 configuration.

Evidence contains exactly the title, repository path and content used by deterministic runbook analysis. These are not the separate contextual D1 FTS results viewed afterward. Existing hypothesis/response wording remains unconfirmed; human feedback is never read by analysis or retrieval. Edits may invalidate the current analysis while leaving its historical snapshots available.

Legacy incidents keep their current analysis and audit. Their historical collection starts empty unless analyzed after 0006. The UI explicitly explains that pre-migration analyses were not backfilled. No guessed time, actor, version or cause is inserted. History begins prospectively, survives refresh/restart and is never changed by feedback corrections.

## Privacy and resource limits

The write-authorized feedback summary returns exactly `{"status":"insufficient_sample"}` for 0–4 current valid feedback events, regardless of repeat requests. Superseded feedback is excluded; retries/idempotent duplicates do not inflate the sample. It rejects all filtering/pagination parameters. At five events, global summary metrics return `status: "available"`; reason/document breakdowns remain empty to avoid exposing small groups or their complements. Individual feedback is never returned by summary.

These are human laboratory opinions, not accuracy or ground truth. Five events do not mean five distinct people. The threshold does not provide differential privacy against temporal comparison after publication; no claim of anonymity is made. An observer cannot distinguish 0–4 from response fields/messages, but this is not a constant-time service. Feedback is isolated from ranking, threshold, analysis, priority and automation.

Analysis history includes authenticated actor identifiers and synthetic incident/runbook content. Read grants authorize access to the shared laboratory workspace, as with existing audit; there is no new per-ticket tenancy contract. Do not put tokens or real personal data in synthetic tickets or publish database backups, private identities, cursor signing material or raw audit/history exports. No retention, purge, reingestion or export policy is implemented.

D1 remains the sole data binding. Each analysis adds one history write plus its index maintenance; each page uses bounded indexed reads and a small key lookup. Append-only storage still grows over time. Workers Free and D1 Free are preserved; operators must monitor quota consumption and explicitly plan capacity/recovery before a separately authorized rollout. No paid fallback, new account, billing change or remote action is part of this delivery.

## Validation and review

Worker/D1 tests cover clean install, upgrade from representative 0001–0005 data, FTS/data preservation, optimistic conflicts, immutable history, refresh/restart persistence, cursor manipulation/expiry/scope/limits, stable navigation under inserts and updates, and authenticated actor isolation. Frontend and Playwright cover load/error/retry, focus, history, repeated analyses and 390px layout. The standard suites also retain same-origin, strict JSON, UTF-8 size, Auth0, idempotency and feedback append-only checks.

Lead Architect reviews contracts and migration compatibility; AI/RAG reviews frozen evidence and feedback isolation; Platform & Security reviews D1/auth/privacy/bounds; QA & Red Team reviews adversarial navigation, concurrency and keyboard/mobile behavior. Execution results for this delivery are recorded in the PR and final implementation report, not inferred from the historical release validation counts.
