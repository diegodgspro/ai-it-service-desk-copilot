# Web development roadmap

## Local implementation completed, 2026-09-09

The first web version is implemented under `web/`; the Python/Streamlit lab remains intact. See [Windows setup and architecture](../web/README.md) for exact commands.

Completed: responsive React dashboard; Worker API; local D1 schema and synthetic seeds; shared knowledge articles and profiles; deterministic runbook matching; all nine priority combinations; persisted current analyses, ticket state and append-only audit; versioned approval/rejection; invalidation on edits/reanalysis; reviewed handover and explicit restoration confirmation. There are no external AI calls or execution bridges.

Authorization is prepared as a fail-closed server boundary. An explicitly enabled loopback-only identity supports local development. Production rejects all requests, including forged Access assertions and static asset requests. JWT signature/claim validation and live Access configuration remain deployment blockers.

Verification on Windows: 29 Python regressions passed on the inspected Python 3.13.15 interpreter; eight workerd/D1 integration tests passed; TypeScript checking and the production asset/Worker dry-run build passed. Playwright with installed Microsoft Edge passed the main workflow, reload persistence, approval/rejection, invalidation and resolution gate. Desktop (1440 pixels) and mobile (390 pixels) browser captures were visually inspected; the mobile check found no document overflow. No JavaScript page errors were observed. npm audit reported zero vulnerabilities after the documented transitive dependency override.

The GitHub Actions workflow now retains Python 3.11/3.12/3.13 and adds Node 22 web installation, type checking, D1 tests, production build, local migrations and Chromium browser verification. Remote execution of the new workflow is not claimed in this local implementation phase.

## Remaining free deployment milestones

1. Configure a Workers Free/D1 Free/Access Free account and verify Access can protect the free Workers hostname without a domain purchase. No resources have been provisioned.
2. Implement and test Access JWKS signature verification, issuer/audience/time claims, key rotation failure handling, server-side user allowlist and operation permissions. Retain denial on every missing/invalid token; protect API, assets, preview URLs and alternate hostnames.
3. Replace the local placeholder D1 ID only after authorized provisioning. Apply reviewed migrations remotely in a separate deployment phase. Define archival retention/export, backups, pagination and error handling for Free-plan resource limits. Current analysis bodies are persisted, but older bodies are not archived; prior identifiers and decisions remain in the audit.
4. Review and authorize deployment separately. Use a free Workers hostname only; no paid subscriptions, containers, Neon or domain purchases.
5. Optionally add the bounded Workers AI narrative provider after rechecking current Free eligibility and implementing explicit quota budgets/errors. Keep all priority, authorization, action selection and approval decisions outside provider control. No automatic paid fallback.
6. Evaluate an isolated public read-only synthetic recruiter demonstration. It is not implemented or exposed by this phase.

The original architectural proposal follows and remains the direction for the later deployment/AI phase.



## Architecture and scope

Preserve the working Python/Streamlit lab, local classifier, knowledge articles and tests. Add a separate TypeScript web interface and Cloudflare Workers API in a future phase. Serve static assets and the API using a free workers.dev address. Do not attempt to run Streamlit or scikit-learn inside Workers; share versioned JSON contracts and synthetic fixtures, with parity tests for rules ported to TypeScript.

Use Cloudflare D1 for tickets, reviewed analyses, technician notes and append-only simulation audit events. Use schema migrations, parameterized queries, bounded pagination and indexes. Store only synthetic records and define retention/reset procedures. Neon is unnecessary unless a concrete PostgreSQL requirement emerges.

Protect the restricted panel with Cloudflare Access. Validate Access JWTs server-side on every protected API request: signature against the team's keys, issuer, application audience and expiry. Apply a server-side user allowlist and operation permissions; never trust a browser flag or unsigned email header. Deny missing or invalid authorization and test direct API access, alternate hostnames, CSRF and object-level permissions. Use Access protection for the free Workers hostname; if the account configuration cannot meet the free-only constraint, pause that milestone rather than buy a domain.

Consider a separate public read-only demonstration for recruiters: fixed synthetic incidents and precomputed, clearly labeled results. Give public routes no write or live AI capability and isolate them from restricted data and endpoints. Preserve the disclosures: synthetic data, simulated automation, uncalibrated classifier scores, working hypotheses and non-operational connector scaffolds. Authored previews must never be labeled actual UI screenshots.

## Workers AI and policy boundaries

Initial candidate: `@cf/zai-org/glm-4.7-flash`, explicitly listed as available on Workers Free in Cloudflare's [July 28, 2026 eligibility notice](https://developers.cloudflare.com/changelog/post/2026-07-28-models-require-workers-paid/). Recheck eligibility, model lifecycle and output suitability before implementation. This provider has not been integrated or tested by this project.

Use the Workers AI binding only in the restricted API for bounded narrative drafts grounded in the knowledge articles. Validate input size and output schema, cap output tokens, apply per-user rate limits and reserve a conservative daily application budget atomically before each call. Account for other Workers sharing the allocation and monitor actual usage. Cloudflare currently includes 10,000 Neurons per day; Free requests fail after exhaustion. See [Workers AI pricing](https://developers.cloudflare.com/workers-ai/platform/pricing/).

Handle quota exhaustion, rate limits, capacity errors, timeouts and model ineligibility explicitly. Stop calls when the budget is exhausted; show an English unavailable/quota message with UTC reset information when known. Offer a clearly labeled deterministic runbook mode selected by the user. No automatic paid fallback, upgrade, model substitution or unbounded retries. Do not enroll in Workers Paid or prepaid AI credits.

Priority, escalation rules, allowlisted action IDs, authorization, approval and resolution gates remain deterministic server-side code outside LLM control. The model may draft text; it cannot approve actions, change priority or execute commands. Keep automation simulated. Tie approval to a specific analysis version and record the human actor and decision. Test malicious ticket instructions and model responses attempting policy overrides.

## Free-only delivery milestones

1. Define API schemas and synthetic fixtures; preserve all 29 Python regressions and add TypeScript policy parity checks.
2. Build the interface and Workers API locally; add D1 migrations, synthetic seeds and persistence tests.
3. Add Access JWT validation and permissions; verify unauthorized reads/writes fail server-side before exposing the panel.
4. Add the optional Workers AI provider, budget controls and failure tests; verify deterministic decisions cannot be overridden.
5. Evaluate the public read-only demonstration, accessibility and genuine browser screenshots. Review deployment separately after verifying all free-plan requirements.

Acceptance requires free plans only: no paid subscriptions, containers or domain purchases. Recheck [Workers limits](https://developers.cloudflare.com/workers/platform/limits/), [D1 pricing](https://developers.cloudflare.com/d1/platform/pricing/) and [Access JWT validation](https://developers.cloudflare.com/cloudflare-one/access-controls/applications/http-apps/authorization-cookie/validating-json/) before implementation. When a free limit is reached, fail gracefully or reduce scope; do not enable billing. Cloudflare deployment and LinkedIn publication are outside this phase.
