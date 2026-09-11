# DeskPilot

## v1.1.0 — Intelligent Ticket Intake

Authenticated users can describe a synthetic IT problem, review a deterministic structured draft, answer relevant missing-information questions, edit it, and explicitly confirm incident creation. Drafts stay in the browser; only confirmed incidents are persisted and audited. Suggestions use transparent signal matching, not an external LLM or an AI diagnosis. Priority remains governed by the existing impact × urgency matrix, and automation remains simulated and human-controlled.

**An IT service desk portfolio by Diego Gabriel dos Santos.** Turn a synthetic incident into an evidence-led troubleshooting plan, with human review before every simulated action.

**Live demo:** https://deskpilot.diegodgspro.workers.dev

> **Synthetic data only · Simulated automation.** The login page is public; the workspace requires an authorized Auth0 account. This is a personal portfolio, not an enterprise ITSM service.

## Production status — v1.1.0

Cloudflare Worker, remote D1 and Auth0 operate together. Production acceptance on September 11, 2026 confirmed login, structured draft generation, relevant follow-up questions, policy-controlled priority, explicit confirmation, incident creation and persistence across refresh and logout/login. The eight existing synthetic incidents remained compatible after migration `0003_structured_intake.sql`. Cloudflare Access is intentionally not used. Workers Free, D1 Free and Auth0 Free are the cost boundary; no paid fallback is authorized.

See the [v1.1.0 release](https://github.com/diegodgspro/ai-it-service-desk-copilot/releases/tag/v1.1.0), [changelog](CHANGELOG.md) and [deployment and recovery runbook](docs/cloudflare-deployment.md).

## Features

- Authenticated intelligent ticket intake with editable structured drafts and relevant follow-up questions.
- Explicit confirmation before an incident is created, persisted and recorded in the audit trail.
- Responsive React dashboard for identity, Windows, networking and application support scenarios.
- Deterministic incident analysis: priority matrix, runbook matching, working hypotheses and manual/security escalation.
- Evidence from nine knowledge articles, investigation steps and response drafts.
- Human-approved or rejected **simulations**; the dashboard runs no PowerShell or external IT operation.
- Persisted ticket edits, current analyses, reviewed handovers and append-only audit events.
- Optimistic concurrency, stale-approval invalidation and restoration confirmation before resolution.
- Auth0 login with independent server-side read/write authorization.
- Separate Python/Streamlit lab with local classification, retrieval, mock ITSM exports and optional Ollama narrative enrichment.

## Architecture and security

`React + TypeScript → same-origin Cloudflare Worker API → Cloudflare D1`

Auth0 Universal Login uses Authorization Code with PKCE and in-memory tokens. The Worker verifies RS256 access tokens against configured JWKS, issuer and audience. Server-side grants control every read and write; browser roles, emails and token scope claims do not grant permissions. Anonymous requests return 401; authenticated accounts without the required grant receive 403. Mutations require the exact production origin and JSON.

The SPA shell is public; API records are protected. The loopback development identity is disabled in production. `web/.env.local` and `web/.dev.vars` remain ignored. Although incidents are synthetic, authenticated audit actor identifiers are private and must not be published in exports or screenshots.

Web analysis and ticket intake are deterministic, with no LLM calls or confidence score. The Python lab uses TF-IDF/logistic regression on 40 authored examples and optional Ollama for narrative fields only. Neither system confirms incident causes; outputs are working hypotheses requiring investigation. [Architecture](docs/architecture/architecture.md) · [Web contracts](web/README.md).

## Local web setup

Use Node.js 22 or newer and Python 3.11–3.13 for the policy parity test:

```powershell
cd web
npm ci
npm run dev
```

Open http://127.0.0.1:8787 and select **Enter local test workspace**. This uses local D1 and an explicit development identity without cloud credentials. For real local Auth0 validation, follow [web setup](web/README.md) and use `npm run dev:auth0`.

## Local Python/Streamlit lab

From the repository root on Windows:

```powershell
py -3.13 -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
.\.venv\Scripts\python.exe -m streamlit run app.py
```

On macOS/Linux use `python3 -m venv .venv`, then `.venv/bin/python` for installation and launch. Open http://localhost:8501. No API key or database is required. Mock records and audit events are session-local; export reviewed JSON before closing. This lab is not a packaged Python distribution.

Optional Ollama settings are in `.env.example`. Its loopback-only adapter is tested with mocked responses, not a live model. Priority, approval and action selection remain outside model control. [Demo guide](docs/demo-guide.md) · [ITSM extension boundaries](docs/integrations.md).

## Tests and verified coverage

```powershell
# Repository root
.\.venv\Scripts\python.exe -m pip install -r requirements-dev.txt
.\.venv\Scripts\python.exe -m pytest -q
# web/
npm ci
npm run typecheck
npm test
npm run build
npm run test:browser
npm audit
node scripts/production.mjs build
```

The final command requires ignored production settings and replaces the browser fixture build. Browser tests own port 8787 and use isolated test D1. Windows uses Edge; on Linux install Chromium with `npx playwright install --with-deps chromium`.

Verified functional coverage for v1.1.0: **29 Python tests, 42 Worker/D1 checks, 18 frontend tests and seven browser scenarios**, plus TypeScript and production builds. Checks cover structured intake, all nine priority combinations, authentication failures, authorization, persistence, concurrency, stale approvals, simulated decisions, restoration gates, OAuth behavior and desktop/mobile workflows. Counts are not line-coverage percentages or model accuracy measurements. GitHub Actions runs Python 3.11/3.12/3.13 and the Node 22 web suite. [Validation record](docs/validation.md).

## Screenshots

No genuine interface captures are committed for this release. Browser tests generate actual desktop/mobile login and dashboard captures in ignored `web/.test-build/`; review them before publication. Existing [demonstration previews](docs/demo-images/README.md) and diagrams are not UI screenshots. [Capture guide](docs/screenshots/README.md).

## Limitations and roadmap

No multi-tenancy, enterprise SLA, real ITSM adapter, live command execution or unattended resolution. Current analyses persist, but historical analysis bodies are not archived. The queue is capped at 100 records; the UI shows the latest 100 audit events per ticket. Browser cookie restrictions may require another login after reload. Free quotas constrain availability; exhaustion must never trigger paid fallback.

Future work includes pagination and retention, quota/error handling, accessibility review, independent evaluation, a sandbox adapter and an isolated public read-only demonstration. Optional narrative enrichment requires separate free-eligibility and security review. Workers AI is not enabled. [Roadmap](docs/web-roadmap.md).

License: MIT. No employer code or real incident data is included.
