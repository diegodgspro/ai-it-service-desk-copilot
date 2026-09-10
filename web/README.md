# Local web workspace

The React/TypeScript dashboard and Cloudflare Worker API run entirely on your computer. The existing Python/Streamlit lab is unchanged. Only synthetic records belong in either lab.

## Windows setup

Install Node.js 22 LTS or newer, with npm on PATH. Python 3.11–3.13 is needed for the priority parity test; the test uses the repository's Windows virtual environment when present, otherwise `python` on PATH. No Cloudflare login, account, API key, container or paid service is needed.

```powershell
Set-Location C:\Projetos\ai-it-service-desk-copilot\web
npm.cmd ci
npm.cmd run dev
```

Open **http://127.0.0.1:8787**. The start command builds the React assets, bundles the Worker with a dry run, applies migrations to local D1, then starts Wrangler on loopback with the explicit local identity enabled. Stop with Ctrl+C. After editing React source, restart this command to rebuild assets; Worker source reloads through Wrangler.

This workspace also contains an ignored portable Node installation used during implementation. If Node is not on PATH, in the repository root run the following before the commands above:

```powershell
$nodeDir = Get-ChildItem .\.tools -Directory -Filter 'node-*-win-x64' | Select-Object -First 1 -ExpandProperty FullName
if (-not $nodeDir) { throw 'Install Node.js 22 LTS first.' }
$env:Path = "$nodeDir;$env:Path"
```

The portable toolchain is not committed or required for other machines.

## Verification

From `web/`:

```powershell
npm.cmd run typecheck
npm.cmd test
npm.cmd run build
npm.cmd run test:browser
```

The browser test uses installed Microsoft Edge on Windows. On Linux/macOS install Playwright Chromium with `npx playwright install chromium` first. CI installs Chromium and its OS dependencies. The browser test starts the server if needed, changes the synthetic printer incident, restores its authored description and preserves the explicitly labeled verification audit events. It verifies desktop behavior and a 390-pixel mobile layout. Screenshots are genuine browser captures in ignored `.test-build/dashboard-desktop.png` and `.test-build/dashboard-mobile.png`.

From the repository root, preserve the Python check:

```powershell
.\.venv\Scripts\python.exe -m pytest -q
```

## Architecture and contracts

- `src/main.tsx` and `src/style.css`: responsive queue, editable details, evidence, investigation steps, simulation review, response draft and handover.
- `worker/index.ts`: same-origin API, input validation, optimistic version checks and transactional D1 writes.
- `worker/analysis.ts`: explicit priority matrix, title-first runbook matching, security/manual-review routing and a narrative-only provider boundary. This is deterministic matching, not ML or an LLM. No confidence score is calculated.
- `worker/auth.ts`: server authorization entry point, currently local-only and production-deny.
- `scripts/sync-data.mjs`: copies the Python lab's authored profiles and Markdown articles into a bundled JSON asset and generates synthetic seed SQL. Source files remain under `sample_data/` and `knowledge_base/`.
- `migrations/`: SQLite/D1 schema and synthetic seeds; `shared/types.ts`: typed API records.
- `tests/api.test.mjs`: real workerd/D1 integration tests, using the installed Miniflare compatibility adapter. No mocked database.
- `browser/workflow.spec.ts`: repeatable browser workflow.

The API exposes `GET /api/tickets`, `GET/PATCH /api/tickets/:id` and `POST /api/tickets/:id/analyze|decision|handover`. Every mutation supplies the last observed `version`. Decisions and handovers also supply `analysisId`. The server owns identity, priority, allowed actions and confirmation gates. It ignores client actor/action overrides. Conflicts return 409; reload before retrying.

Ticket detail changes reopen the ticket and invalidate its analysis/approval. Reanalysis also invalidates the prior decision. Approval/rejection is single-use per analysis. A transactional batch couples each successful version update with an append-only audit event, preventing duplicate decisions during concurrent requests. Resolution requires a current analysis, a bounded technician note and the boolean `restored: true`. No commands run; nothing is sent to users or ITSM services.

The current analysis persists on each ticket. Previous analysis identifiers remain in the audit; old analysis bodies are not retained as a historical archive. The panel shows the latest 100 audit events per ticket; all events remain in D1. The queue is bounded to 100 records, sufficient for the eight-fixture lab. Production pagination, archival retention and export are future work.

## Local persistence and reset

Wrangler persists D1 under ignored `web/.wrangler/state/`. Restarting the server or reloading the browser preserves records. `npm run db:migrate` explicitly uses `--local`; no remote database exists. The all-zero database ID is a local placeholder.

To start a fresh lab, stop Wrangler and move `.wrangler/state` to a backup directory, then run `npm run dev`. This intentionally resets local records; keep your backup if you need the old audit. Integration tests use a separate temporary database and remove only their own temporary directory. Do not modify applied migration files to update a persisted database: add a new migration. The seed generator is for reproducible baseline fixtures, not for overwriting current records.

## Authentication status

Local identity is enabled only by the explicit `npm run dev` flags `APP_ENV=local` and `LOCAL_DEV_IDENTITY=enabled`, and only for HTTP loopback hostnames. The identity is fixed server-side. Client identity headers and Access assertions are rejected in local mode. Mutations require a matching Origin and JSON content type.

The checked-in configuration defaults to production with local identity disabled. All production requests, including static assets, fail with 401. A fake or missing JWT cannot grant access. **Cloudflare Access JWT validation is not implemented or live-validated.** This is an intentional deployment blocker, not completed authentication.

Before deployment, implement signature verification using trusted Access JWKS, an allowed algorithm, issuer, application audience, expiry and not-before validation; handle key rotation and JWKS failures by denying access. Derive the actor only from verified claims. Configure the server-side user allowlist and operation permissions, protect every hostname and preview URL, and test direct API access, cross-origin writes and object permissions. Do not enable the local identity on any deployed environment.

## Free deployment follow-up

See [the roadmap](../docs/web-roadmap.md). Provisioning, remote migrations and deployment are outside this implementation. Retain Workers Free, D1 Free and an eligible Access Free setup on a free Workers hostname; buy no domain and enable no paid fallback. Neon is unnecessary without a PostgreSQL requirement.

The future Workers AI provider may supply bounded narrative drafts only. No AI binding, model download, external AI call or paid fallback exists here. Before integration, recheck model eligibility and implement explicit budget/quota failure handling.

Official documentation checked on 2026-09-09: [D1 local development](https://developers.cloudflare.com/d1/best-practices/local-development/), [Worker-first static assets](https://developers.cloudflare.com/workers/static-assets/binding/), [Miniflare](https://developers.cloudflare.com/workers/testing/miniflare/), [Access JWT validation](https://developers.cloudflare.com/cloudflare-one/access-controls/applications/http-apps/authorization-cookie/validating-json/), [Workers limits](https://developers.cloudflare.com/workers/platform/limits/) and [D1 pricing](https://developers.cloudflare.com/d1/platform/pricing/).

The lockfile pins the exercised toolchain. Wrangler currently depends on Miniflare 5 alpha; tests use its exported v4 compatibility adapter. A `sharp` override pins 0.35.4 to address the upstream transitive advisory reported by npm. Recheck the override when upgrading Wrangler; the application has no image-processing feature.

## Free production deployment sequence

1. In a Cloudflare account on Workers Free, confirm the Zero Trust/Access Free plan (up to 50 users), keep billing disabled, and choose one real `workers.dev` hostname. Do not invent account, database, issuer, audience, or hostname values.
2. Create the D1 database in the dashboard or with Wrangler, record its returned name and ID, then replace the checked-in local placeholder only in an uncommitted deployment configuration. Apply `npm run db:migrate -- --remote` after reviewing every migration; never edit an applied migration.
3. Configure the Worker production variables `APP_ENV=production`, `LOCAL_DEV_IDENTITY=disabled`, `ACCESS_ISSUER=https://<team>.cloudflareaccess.com`, `ACCESS_AUDIENCE=<application audience>`, `APP_ORIGIN=https://<protected-workers-hostname>`, and `ACCESS_PERMISSIONS=<JSON subject-to-read/write grants>`. Store no tokens in Git or chat.
4. In Access, protect the Worker production hostname and every preview URL. Disable unneeded preview and `workers.dev` routes; if a route remains enabled, attach the same Access policy. Test each alternate hostname directly so it cannot bypass Access. The Worker also checks the exact configured origin.
5. Deploy only after the configuration review: `wrangler deploy`. Verify an unauthenticated request is 401, a valid Access token with a read grant can list tickets, a read-only identity receives 403 on writes, and invalid, expired, wrongly signed, wrong-audience, and missing tokens are denied. Verify the browser uses the protected hostname and that cross-origin writes return 403.
6. Record the live Worker URL, D1 ID, Access issuer/audience, migration result and verification evidence in the deployment record. Keep all records synthetic and keep simulated automation disabled.

Account-specific prerequisites are the Cloudflare login, the chosen free Workers hostname, the returned D1 name/ID, the Access team domain and application audience, and the server-side subject permission map. Provide these through the deployment environment or secret manager, never in chat.
