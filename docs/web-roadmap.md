# DeskPilot roadmap

## Delivered in v1.0.0 — September 10, 2026

Production: https://deskpilot.diegodgspro.workers.dev

React/TypeScript, Cloudflare Worker, remote D1 and Auth0 are deployed. The user confirmed login, authenticated reads, a write persisted after reload and logout. Both initial migrations are applied. The independent Python/Streamlit MVP remains available locally.

Delivered features include deterministic runbook matching, knowledge evidence, all nine priority combinations, current analyses, versioned approvals, invalidation after edits/reanalysis, simulated actions and reviewed handover with restoration confirmation. Server-owned read/write grants protect every API operation. No external AI call or execution bridge is enabled.

Validation covers 29 Python tests, 39 Worker/D1 checks, 16 frontend tests, six browser scenarios, type checking and production builds. Browser OAuth tests use synthetic mocks; live production acceptance is separate. See [validation](validation.md), [release scope](releases/v1.0.0.md), [web setup](../web/README.md) and [deployment](cloudflare-deployment.md).

## Future increments — not delivered

1. Pagination beyond the bounded queue/audit display, historical analysis archival and a retention/export policy protecting audit identities.
2. Free-quota monitoring, clearer resource-limit errors and recovery rehearsal in an isolated environment.
3. Accessibility review, broader responsive checks and publication of genuine interface captures after privacy review.
4. Independent evaluation for ambiguous, negated and multi-issue incidents; measured technician outcomes without presenting scores as root-cause confidence.
5. A separately isolated public read-only recruiter demo, with fixed synthetic records and no writes or live AI calls.
6. One sandbox ITSM adapter after defining authorization and data boundaries. Vendor adapters remain non-operational scaffolds.
7. Optional bounded narrative enrichment, subject to current free eligibility, atomic budgets, rate limits, schema validation and timeout/quota handling. Deterministic fallback must be explicitly selected; models cannot change priority, grants, action IDs or approval gates.

## Permanent boundaries

Keep Python separate from Workers; share versioned fixtures and policy parity tests. Keep automation simulated and human-reviewed. Workers Free, D1 Free and Auth0 Free only: no billing method, paid products, automatic upgrades or paid fallback. Cloudflare Access is intentionally not used; Workers AI is not enabled. If free quotas are exhausted, fail clearly or reduce scope.

LinkedIn publication is a separate manual task. No enterprise deployment, measured SLA improvement or LLM-confirmed incident cause is claimed.
