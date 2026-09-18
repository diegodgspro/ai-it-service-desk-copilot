# Private export, retention and recovery — v1.4.0

Status: unreleased, local/CI only. Nothing in this procedure authorizes a remote migration, production export, restore, deployment, deletion or retention job.

## Export contract

`POST /api/operations/export` requires an authenticated `write` grant, JSON and the exact application origin. The body accepts only `dataset`, `format`, `limit`, `after`, `from` and `to`; unknown values fail closed. The format is `deskpilot-export+json;version=1`. Pages contain at most 250 rows, one dataset and 1 MiB, use deterministic ordering and an opaque continuation value; dated datasets accept a maximum 31-day UTC window. The response reports row/dataset counts and `X-Artifact-SHA256` over the exact JSON body. Save it only under the Git-ignored `exports/` directory and independently verify the hash. Cancellation simply abandons the current bounded request; no server export state is created.

Sources of truth are `tickets`, `audit`, `analysis_history`, `knowledge_documents`, `knowledge_chunks`, `knowledge_retrieval_events`, `knowledge_retrieval_items` and `knowledge_feedback`. The FTS5 virtual table is derived and must be rebuilt. `pagination_key`, tokens, secrets, permission maps, Auth0 configuration, HMAC material and unknown tables are never exportable. Artifacts are private and may contain actor identifiers/hashes; they are not anonymous. No read-only/public export, R2/S3 upload or external telemetry exists. Logs allowlist only dataset, count, bytes, route, status and duration.

## Retention policy

No deletion, compaction, historical rewrite or automatic purge is implemented. The periods below are planning defaults; organizational and legal obligations take precedence. Any destructive retention needs explicit authorization, an integrity-checked export and a separate PR.

| Category | Purpose and sensitivity | Growth | Recommended retention | Export / authorization |
|---|---|---|---|---|
| Tickets | Operational record; requester/content is private | Low/steady | 24 months after closure | Versioned ticket pages; `write` |
| Audit | Accountability; private actor IDs; append-only | Medium | 36 months | Export before any future purge; `write` |
| Analysis history | Reproducibility; private actor and incident text; append-only | Medium | 24 months | Export with evidence; `write` |
| Retrieval events | Diagnostics; pseudonymous actor hashes; append-only | High | 90 days | Date-bounded export; `write` |
| Retrieved items | Retrieval trace; append-only | High | 90 days with parent event | Export after parent event; `write` |
| Feedback/corrections | Human quality signals; pseudonymous; append-only | Medium | 12 months | Preserve correction chain; `write` |
| Private export artifacts | Recovery/audit copy; highest combined sensitivity | Manual/bounded | 7 days, then approved secure disposal | Local ignored directory only; `write` |

## Isolated recovery rehearsal

Run `npm run sync && npm run test:recovery` from `web/`. The test creates two independent disposable D1 databases, applies migrations 0001–0006, loads the reviewed deterministic seed, restores only `tests/fixtures/recovery-export-v1.synthetic.json`, rebuilds FTS from documents/chunks, and checks counts, logical references, tickets, audit, analyses, retrieval, feedback and all append-only triggers. Each run requires 10 documents and 46 chunks/FTS rows, then compares a logical SHA-256 after normalizing database-generated timestamps. Incompatible format/version/classification/shape fails before writes.

The fixture contains synthetic identities only. The command has no remote database name, bookmark, credentials or network operation. It demonstrates repeatability, not a production restore.

## Free quota monitoring

`POST /api/operations/capacity` (same-origin, authenticated `write`, empty JSON) returns application-observed row counts, approximate total rows and conservative levels: knowledge chunks watch/action at 5,000/10,000; retrieval events at 50,000/100,000. These are internal signals, not byte-accurate storage, request-unit, billing or official quota consumption. `officialUsageAvailable:false` is intentional. Check the authoritative Workers and D1 usage pages in the Cloudflare dashboard; no billing OAuth scope, cron, Analytics Engine, paid binding or telemetry was added.
