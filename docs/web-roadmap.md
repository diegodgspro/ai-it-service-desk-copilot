# Web development roadmap

## Local implementation and Auth0 integration, 2026-09-10

The first web version is implemented under `web/`; the Python/Streamlit lab remains intact. See [Windows setup and architecture](../web/README.md) for exact commands.

Completed: responsive React dashboard; Worker API; local D1 schema and synthetic seeds; shared knowledge articles and profiles; deterministic runbook matching; all nine priority combinations; persisted current analyses, ticket state and append-only audit; versioned approval/rejection; invalidation on edits/reanalysis; reviewed handover and explicit restoration confirmation. There are no external AI calls or execution bridges.

Auth0 authentication is implemented with the official React SDK and Universal Login (Authorization Code with PKCE), the API audience `https://deskpilot-api`, in-memory tokens and bearer API requests. The Worker verifies RS256 with the tenant JWKS, exact issuer/audience, required exp/iat/sub and optional nbf. Explicit server-side subject grants control read/write independently of authentication. Production fails closed for missing/bad tokens or configuration, local identity flags and wrong origins. The public SPA shell enables login; all API data remains protected. The development identity is explicit and HTTP-loopback-only.

Windows validation on 2026-09-10: 29 Python regressions, 39 workerd/D1 checks, 16 frontend tests and six Edge browser scenarios passed. The browser uses the real Auth0 SDK with mocked OAuth/API responses; Worker tests use ephemeral RSA keys and mocked JWKS with real local D1. No real Auth0 tenant is contacted. TypeScript checking and the production asset/Worker dry-run build also passed locally; a fresh npm install reported zero vulnerabilities. Genuine login and dashboard captures cover desktop and 390-pixel mobile layouts.

For exact Windows installation, ignored configuration files, Auth0 dashboard URL settings and live acceptance steps, follow [web/README.md](../web/README.md#auth0-setup-for-live-local-validation-windows). From the repository root run `.\.venv\Scripts\python.exe -m pytest -q`; from `web` run `npm.cmd ci`, `npm.cmd run typecheck`, `npm.cmd test`, `npm.cmd run build`, then (with port 8787 free) `npm.cmd run test:browser`. Rebuild afterward to remove browser fixture settings. Use `npm.cmd run dev:auth0` for live Auth0 validation; `npm.cmd run dev` is strictly the offline test identity. Node 22+ must be on PATH; the README includes the optional Windows portable-Node PATH command.

GitHub Actions retains Python 3.11/3.12/3.13 and Node 22 web installation, type checking, D1/frontend tests, production build and Chromium browser verification. The Auth0 implementation is delivered through an unmerged feature pull request. No deployment or remote migration is part of this phase.

## Remaining free deployment milestones

1. Complete live Auth0 Free validation using a standard tenant domain, SPA Client ID, API identifier `https://deskpilot-api` and a server-side subject permission map in ignored local files. Configure callbacks/logout/web origins for `http://127.0.0.1:8787` and the planned `https://deskpilot.diegodgspro.workers.dev`. No Client Secret, custom domain or paid features. Real tenant validation remains blocked on these account-specific non-secret values.
2. After live authentication and read/write denial checks pass, configure Workers Free/D1 Free for a separately authorized deployment. Keep `APP_ENV=production`, `LOCAL_DEV_IDENTITY=disabled` and the exact production `APP_ORIGIN`. Disable unnecessary preview routes and verify alternate-host API denial. The login shell is public by design; API records are private.
3. Replace the local placeholder D1 ID only after authorized provisioning. Apply reviewed migrations remotely in a separate deployment phase. Define archival retention/export, backups, pagination and error handling for Free-plan resource limits. Current analysis bodies are persisted, but older bodies are not archived; prior identifiers and decisions remain in the audit.
4. Review and authorize deployment separately. Use a free Workers hostname only; no paid subscriptions, containers, Neon or domain purchases.
5. Optionally add the bounded Workers AI narrative provider after rechecking current Free eligibility and implementing explicit quota budgets/errors. Keep all priority, authorization, action selection and approval decisions outside provider control. No automatic paid fallback.
6. Evaluate an isolated public read-only synthetic recruiter demonstration. It is not implemented or exposed by this phase.

The architecture below incorporates Auth0 and remains the direction for the later deployment/AI phase.



## Architecture and scope

Preserve the working Python/Streamlit lab, local classifier, knowledge articles and tests. Maintain the separate TypeScript web interface and Cloudflare Workers API under `web/`. Serve static assets and the API using a free workers.dev address. Do not attempt to run Streamlit or scikit-learn inside Workers; share versioned JSON contracts and synthetic fixtures, with parity tests for rules ported to TypeScript.

Use Cloudflare D1 for tickets, reviewed analyses, technician notes and append-only simulation audit events. Use schema migrations, parameterized queries, bounded pagination and indexes. Store only synthetic records and define retention/reset procedures. Neon is unnecessary unless a concrete PostgreSQL requirement emerges.

Protect API data with Auth0 bearer access tokens, validated by the Worker against the configured tenant JWKS and exact issuer/audience. Apply the server-side subject permission map for every read/write operation; never trust browser identity headers, JWT scope claims or profile email as grants. Keep production fail-closed checks and same-origin/JSON requirements. Use Auth0 Free Universal Login on the standard tenant domain and serve the SPA at the free Workers hostname. The implementation uses neither a SPA Client Secret nor paid Auth0 features.

Consider a separate public read-only demonstration for recruiters: fixed synthetic incidents and precomputed, clearly labeled results. Give public routes no write or live AI capability and isolate them from restricted data and endpoints. Preserve the disclosures: synthetic data, simulated automation, uncalibrated classifier scores, working hypotheses and non-operational connector scaffolds. Authored previews must never be labeled actual UI screenshots.

## Workers AI and policy boundaries

Initial candidate: `@cf/zai-org/glm-4.7-flash`, explicitly listed as available on Workers Free in Cloudflare's [July 28, 2026 eligibility notice](https://developers.cloudflare.com/changelog/post/2026-07-28-models-require-workers-paid/). Recheck eligibility, model lifecycle and output suitability before implementation. This provider has not been integrated or tested by this project.

Use the Workers AI binding only in the restricted API for bounded narrative drafts grounded in the knowledge articles. Validate input size and output schema, cap output tokens, apply per-user rate limits and reserve a conservative daily application budget atomically before each call. Account for other Workers sharing the allocation and monitor actual usage. Cloudflare currently includes 10,000 Neurons per day; Free requests fail after exhaustion. See [Workers AI pricing](https://developers.cloudflare.com/workers-ai/platform/pricing/).

Handle quota exhaustion, rate limits, capacity errors, timeouts and model ineligibility explicitly. Stop calls when the budget is exhausted; show an English unavailable/quota message with UTC reset information when known. Offer a clearly labeled deterministic runbook mode selected by the user. No automatic paid fallback, upgrade, model substitution or unbounded retries. Do not enroll in Workers Paid or prepaid AI credits.

Priority, escalation rules, allowlisted action IDs, authorization, approval and resolution gates remain deterministic server-side code outside LLM control. The model may draft text; it cannot approve actions, change priority or execute commands. Keep automation simulated. Tie approval to a specific analysis version and record the human actor and decision. Test malicious ticket instructions and model responses attempting policy overrides.

## Free-only delivery milestones

1. Define API schemas and synthetic fixtures; preserve all 29 Python regressions and add TypeScript policy parity checks.
2. Build the interface and Workers API locally; add D1 migrations, synthetic seeds and persistence tests.
3. Auth0 JWT validation and permissions are implemented and tested with mocks; complete live local validation before any deployment.
4. Add the optional Workers AI provider, budget controls and failure tests; verify deterministic decisions cannot be overridden.
5. Evaluate the public read-only demonstration, accessibility and genuine browser screenshots. Review deployment separately after verifying all free-plan requirements.

Acceptance requires free plans only: no paid subscriptions, containers or domain purchases. Recheck [Workers limits](https://developers.cloudflare.com/workers/platform/limits/), [D1 pricing](https://developers.cloudflare.com/d1/platform/pricing/) and [Auth0 access-token validation](https://auth0.com/docs/secure/tokens/access-tokens/validate-access-tokens) before implementation. When a free limit is reached, fail gracefully or reduce scope; do not enable billing. Cloudflare deployment and LinkedIn publication are outside this phase.
