# DeskPilot web workspace

Production is live at https://deskpilot.diegodgspro.workers.dev with Auth0 login, protected reads/writes and remote D1 persistence accepted by the user. Synthetic data only; all automation is simulated. The React/TypeScript dashboard and Cloudflare Worker API support local development and production operations described in [the deployment runbook](../docs/cloudflare-deployment.md). The existing Python/Streamlit lab is unchanged. Only synthetic records belong in either lab.

## Windows setup

Install Node.js 22 LTS or newer, with npm on PATH. Python 3.11–3.13 is needed for the priority parity test; the test uses the repository's Windows virtual environment when present, otherwise `python` on PATH. No Cloudflare login, account, API key, container or paid service is needed.

```powershell
Set-Location C:\Projetos\ai-it-service-desk-copilot\web
npm.cmd ci
npm.cmd run dev
```

Open **http://127.0.0.1:8787** and select **Enter local test workspace**. This command is for the offline development/test identity only; use `dev:auth0` below for real authentication. The start command builds the React assets, bundles the Worker with a dry run, applies migrations to local D1, then starts Wrangler on loopback with the explicit local identity enabled. Stop with Ctrl+C. After editing React source, restart this command to rebuild assets; Worker source reloads through Wrangler.

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
npm.cmd audit
```

Stop any running Wrangler server before browser verification; the suite owns port 8787 and refuses to reuse an existing server. The browser tests use installed Microsoft Edge on Windows. On Linux/macOS install Playwright Chromium with `npx playwright install chromium` first. CI installs Chromium and its OS dependencies. The browser suite starts its own server with isolated `.test-build/browser-state` persistence, supplies synthetic frontend Auth0 settings, intercepts OAuth endpoints without contacting a tenant, verifies login/callback/logout and API errors, changes the synthetic printer incident, restores its authored description and preserves the explicitly labeled verification audit events. It verifies desktop behavior and a 390-pixel mobile layout. Screenshots are genuine browser captures in ignored `.test-build/dashboard-desktop.png`, `.test-build/dashboard-mobile.png`, `.test-build/login-desktop.png` and `.test-build/login-mobile.png`. Browser OAuth tests exercise the real SDK with mocked OAuth/API responses; separate integration tests verify actual RSA signatures through mocked JWKS in workerd and permissions against local D1. Test credentials and mocks are confined to tests. Run `npm.cmd run build` afterward to replace the browser fixture build with your normal build settings.

From the repository root, preserve the Python check:

```powershell
.\.venv\Scripts\python.exe -m pytest -q
```

## Architecture and contracts

- `src/main.tsx` and `src/style.css`: responsive queue, editable details, evidence, investigation steps, simulation review, response draft and handover.
- `worker/index.ts`: same-origin API, input validation, optimistic version checks and transactional D1 writes.
- `worker/analysis.ts`: explicit priority matrix, title-first runbook matching, security/manual-review routing and a narrative-only provider boundary. This is deterministic matching, not ML or an LLM. No confidence score is calculated.
- `worker/auth.ts`: Auth0 RS256/JWKS validation and explicit server-side subject permissions.
- `src/auth.tsx` and `src/api.ts`: official Auth0 React SDK, login/session UI and same-origin bearer transport.
- `scripts/sync-data.mjs`: copies the Python lab's authored profiles and Markdown articles into a bundled JSON asset and generates synthetic seed SQL. Source files remain under `sample_data/` and `knowledge_base/`.
- `migrations/`: SQLite/D1 schema and synthetic seeds; `shared/types.ts`: typed API records.
- `tests/api.test.mjs`: real workerd/D1 integration tests, using the installed Miniflare compatibility adapter. No mocked database.
- `browser/workflow.spec.ts`: repeatable browser workflow.

The API exposes `GET /api/tickets`, `GET/PATCH /api/tickets/:id` and `POST /api/tickets/:id/analyze|decision|handover`. Every mutation supplies the last observed `version`. Decisions and handovers also supply `analysisId`. The server owns identity, priority, allowed actions and confirmation gates. It ignores client actor/action overrides. Conflicts return 409; reload before retrying.

Ticket detail changes reopen the ticket and invalidate its analysis/approval. Reanalysis also invalidates the prior decision. Approval/rejection is single-use per analysis. A transactional batch couples each successful version update with an append-only audit event, preventing duplicate decisions during concurrent requests. Resolution requires a current analysis, a bounded technician note and the boolean `restored: true`. No commands run; nothing is sent to users or ITSM services.

The current analysis persists on each ticket. Previous analysis identifiers remain in the audit; old analysis bodies are not retained as a historical archive. The panel shows the latest 100 audit events per ticket; all events remain in D1. The queue is bounded to 100 records, sufficient for the eight-fixture lab. Production pagination, archival retention and export are future work.

## Local persistence and reset

Wrangler persists D1 under ignored `web/.wrangler/state/`. Restarting the server or reloading the browser preserves records. `npm run db:migrate` explicitly uses `--local`; production uses the separate remote binding in `wrangler.json`. Never copy local state to production.

To start a fresh lab, stop Wrangler and move `.wrangler/state` to a backup directory, then run `npm run dev`. This intentionally resets local records; keep your backup if you need the old audit. Integration tests use a separate temporary database and remove only their own temporary directory. Do not modify applied migration files to update a persisted database: add a new migration. The seed generator is for reproducible baseline fixtures, not for overwriting current records.

## Auth0 setup for live local validation (Windows)

Use Auth0 Free with a **Single Page Application** and a custom API whose Identifier is exactly **https://deskpilot-api** and signing algorithm is **RS256**. Use the standard tenant domain (including any region, for example `YOUR_TENANT.us.auth0.com`), not a custom domain. Do not configure or provide a SPA Client Secret. No paid features, Organizations, custom domain, API subscription, or refresh-token entitlement is required by this implementation.

In the Auth0 SPA application settings, configure these exact URL lists:

| Setting | Values (comma separated in the dashboard) |
| --- | --- |
| Allowed Callback URLs | `http://127.0.0.1:8787, https://deskpilot.diegodgspro.workers.dev` |
| Allowed Logout URLs | `http://127.0.0.1:8787, https://deskpilot.diegodgspro.workers.dev` |
| Allowed Web Origins | `http://127.0.0.1:8787, https://deskpilot.diegodgspro.workers.dev` |

The second origin is the live production URL; see the deployment runbook for release status and verification. Enable an appropriate login connection for the SPA and create/use a test account through the Auth0 dashboard. Use the exact loopback URL, not `localhost`, for this documented configuration. The SDK uses Authorization Code with PKCE and Universal Login, requesting `openid profile email` and the API audience. It keeps tokens in memory; it does not persist tokens in localStorage. After a reload it attempts SDK session recovery. Browser cookie restrictions or a missing Auth0 session can require signing in again.

From the repository root, use the portable Node PATH block above if necessary, then:

```powershell
Set-Location C:\Projetos\ai-it-service-desk-copilot\web
npm.cmd ci
# Create only missing files, preserving existing local configuration.
if (-not (Test-Path -LiteralPath .env.local)) {
    Copy-Item -LiteralPath .env.example -Destination .env.local
}
if (-not (Test-Path -LiteralPath .dev.vars)) {
    Copy-Item -LiteralPath .dev.vars.example -Destination .dev.vars
}
notepad.exe .env.local
notepad.exe .dev.vars
```

Set these values in the ignored files (never commit real tenant, client or subject values):

| File | Variable | Exact value to supply |
| --- | --- | --- |
| `.env.local` | `VITE_AUTH0_DOMAIN` | Your Auth0 tenant domain, no scheme or slash |
| `.env.local` | `VITE_AUTH0_CLIENT_ID` | Client ID from the Auth0 **SPA** application |
| `.env.local` | `VITE_AUTH0_AUDIENCE` | `https://deskpilot-api` |
| `.dev.vars` | `AUTH0_ISSUER` | `https://` + the same tenant domain + `/` (trailing slash required) |
| `.dev.vars` | `AUTH0_AUDIENCE` | `https://deskpilot-api` |
| `.dev.vars` | `APP_ORIGIN` | `http://127.0.0.1:8787` |
| `.dev.vars` | `APP_ENV` | `local` |
| `.dev.vars` | `LOCAL_DEV_IDENTITY` | `disabled` |
| `.dev.vars` | `AUTH0_PERMISSIONS` | Single-quoted JSON object mapping exact Auth0 `user_id` / JWT `sub` strings to grants |

Start with `AUTH0_PERMISSIONS='{}'`: authenticated users get 403 until deliberately granted access. In the Auth0 dashboard find the test user's exact **user_id**; put it only in `.dev.vars`, replacing the placeholder in this shape: `AUTH0_PERMISSIONS='{"REPLACE_WITH_SUBJECT":["read"]}'`. For an explicitly authorized writer use `["read","write"]`. A writer must also have read permission. Empty grants are allowed. The entire map is rejected if its structure or any permission is invalid. Email addresses are display data, not authorization keys. The map must never use a `VITE_` prefix or enter the frontend bundle.

Then run:

```powershell
npm.cmd run dev:auth0
```

This builds, migrates **local** D1 and runs **local** Wrangler with the development identity disabled. It performs no deployment or remote migration. Vite variables are read at build time, so restart this command after changing `.env.local`; restart Wrangler after changing `.dev.vars`. `npm.cmd run dev` deliberately enables the offline test identity and does **not** validate Auth0.

Live acceptance steps:

1. Open `http://127.0.0.1:8787`; confirm the login page, follow Universal Login and confirm your name/email appears.
2. With `{}` grants, confirm read requests return 403. Add a `read` grant locally and restart; confirm the queue loads and an attempted mutation returns 403 without modifying data.
3. Explicitly add `write`, restart, then analyze a synthetic ticket and confirm the audit actor is the verified Auth0 subject. Test sign-out and a fresh sign-in/reload. Do not copy tokens into chat, logs or files.
4. In a separate PowerShell window, verify direct anonymous requests are denied:

```powershell
curl.exe -i http://127.0.0.1:8787/api/tickets
curl.exe -i -H "Authorization: Bearer malformed" http://127.0.0.1:8787/api/tickets
curl.exe -i -H "x-user-email: forged@example.invalid" http://127.0.0.1:8787/api/tickets
```

All three return 401 in `dev:auth0`. Expiry, issuer/audience, signature, algorithm, missing claims/configuration, JWKS failures, forged headers, authorization, JSON and cross-origin rejection are tested automatically with synthetic keys/claims.

## Authentication and authorization contract

The SPA shell and `/auth/local` capability response are public so login can start before authentication. They contain no tickets or subject permission map. Every `/api` request is protected server-side, including direct requests. Missing/bad authentication returns 401; a valid identity without the operation's server grant returns 403. The frontend requests a token before every API call (the SDK may use its memory cache), sends `Authorization: Bearer`, omits cookies, and refuses redirects or non-API destinations. It clears the protected view on token/401 failure and offers sign-in again. Loading, login/callback failure and permission denial have explicit messages; provider diagnostics and tokens are not rendered or logged.

The Worker accepts only RS256 access tokens verified by `jose` against the configured tenant's `/.well-known/jwks.json`. Issuer must match exactly, audience must include `https://deskpilot-api`, `exp` must be unexpired, `iat` numeric/non-negative/not in the future and earlier than `exp`, and `sub` a nonempty string. `nbf` is also enforced if supplied. No ID token, JWT scope, browser role or identity header can grant read/write permissions. Only own properties in the server permission map are used, so prototype names cannot inherit grants.

JWKS retrieval times out after five seconds. Verified public keys are cached per Worker isolate for at most ten minutes; unknown key IDs can trigger a refresh after the 30-second cooldown. A required refresh that fails, times out or returns invalid/unknown keys denies the request; cached valid keys remain usable within their bounded lifetime. No request-supplied issuer or key URL is fetched. Missing/malformed configuration denies API access. Production requires HTTPS, the exact `APP_ORIGIN`, `APP_ENV=production` and `LOCAL_DEV_IDENTITY=disabled`; alternate/preview origins fail closed. Every mutation additionally requires an exact matching Origin and the `application/json` media type.

The local test identity requires both explicit flags (`APP_ENV=local`, `LOCAL_DEV_IDENTITY=enabled`) and an HTTP loopback request. Production and HTTPS cannot use it. Requests carrying browser identity headers or a bearer token are rejected in that mode, rather than silently falling back to the test actor. The UI requires an explicit **Enter local test workspace** click, including after reload; that button is not an authorization boundary.

## Production validation

Local Windows validation on 2026-09-10: 29 Python tests, 39 workerd/D1 checks, 16 frontend tests and six Edge browser scenarios passed. TypeScript checking and the production Vite/Worker dry-run build also passed. A fresh `npm.cmd ci` completed with zero reported vulnerabilities. The browser suite checks desktop and 390-pixel mobile layouts, OAuth errors, bearer propagation, logout and the original persisted incident workflow. Login and dashboard captures are visually inspected. GitHub Actions runs Python 3.11/3.12/3.13 plus Node 22 web tests, type checking, build and Chromium workflows on pushes and pull requests.

The user successfully validated real local Auth0 login, authenticated reads and authenticated writes on 2026-09-10. The ignored issuer setting includes the required trailing slash. The user also confirmed production login, authenticated reads, a write persisted after reload and logout on 2026-09-10. No real tenant values, Client IDs, subjects, tokens or secrets are included in examples/tests. `auth0.production.example.json` documents the Worker production variable shape and the production origin; it is not a deployment configuration. Keep a real copy, if needed later, in ignored `auth0.production.local.json` and store the actual map server-side. Build-time SPA values are supplied by `node scripts/production.mjs build` from ignored `.env.local`; the helper validates issuer/audience consistency and never prints settings. Do not put the permission map in public frontend variables.

Follow [the deployment runbook](../docs/cloudflare-deployment.md) for remote D1 migrations, secrets, review/merge, deployment, rollback and manual Auth0 acceptance. Keep Workers Free, D1 Free and Auth0 Free, no custom domain and no paid fallback. The production Worker and remote D1 are deployed; both initial migrations are applied. See [the roadmap](../docs/web-roadmap.md).

Implementation references: [Auth0 React SDK](https://auth0.com/docs/libraries/auth0-react), [Auth0 access-token validation](https://auth0.com/docs/secure/tokens/access-tokens/validate-access-tokens), [D1 local development](https://developers.cloudflare.com/d1/best-practices/local-development/) and [Worker-first assets](https://developers.cloudflare.com/workers/static-assets/binding/).

The lockfile pins the exercised toolchain. Wrangler currently depends on Miniflare 5 alpha; tests use its exported v4 compatibility adapter. A `sharp` override pins 0.35.4 to address the upstream transitive advisory. Recheck the override when upgrading Wrangler; the application has no image-processing feature.
