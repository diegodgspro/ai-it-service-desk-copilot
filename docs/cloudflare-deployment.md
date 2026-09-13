# DeskPilot production operations

Production acceptance on 2026-09-10: the user confirmed Auth0 login, authenticated reads, an authenticated write persisted after reload and logout. Both initial remote D1 migrations are applied. See [v1.0.0](releases/v1.0.0.md).

## Architecture and cost boundary

Production is https://deskpilot.diegodgspro.workers.dev: Worker `deskpilot`
serves Vite assets and the same-origin API; binding `DB` connects to the single
`deskpilot-production` D1 database. Auth0 Universal Login uses a public SPA client,
Authorization Code with PKCE, in-memory tokens and RS256 access-token validation.
Only server-side grants authorize API reads and writes. The Python/Streamlit lab
and authored synthetic fixtures remain independent and unchanged.

Use Workers Free, D1 Free and Auth0 Free only. No Cloudflare Access, paid fallback,
Workers AI, Containers, custom domain, or paid enrollment is authorized. Verify
Workers Free in the account dashboard before provisioning or deploying; stop if
billing information or a plan upgrade is requested. A Workers usage-model label
alone does not establish the account's subscription plan.

Workers Free currently allows 100,000 requests/day and 10 ms CPU per invocation.
D1 Free includes 5 million rows read/day, 100,000 rows written/day and 5 GB total
storage, with a 500 MB per-database limit. Account-wide limits include other
projects. This Worker routes assets through the Worker, so budget those requests
too. Exhaustion must cause errors or wait for reset, never a paid fallback.
Monitor usage in the dashboard. Authentication CPU cost must also fit Free;
never weaken signature validation to avoid a resource limit.

References: [Workers limits](https://developers.cloudflare.com/workers/platform/limits/),
[D1 pricing](https://developers.cloudflare.com/d1/platform/pricing/),
[D1 limits](https://developers.cloudflare.com/d1/platform/limits/).

## Auth0 production settings

When maintaining the existing Auth0 Single Page Application, verify exactly
`https://deskpilot.diegodgspro.workers.dev` is present in **Allowed Callback URLs**,
**Allowed Logout URLs**, and **Allowed Web Origins**. Keep
`http://127.0.0.1:8787` in each list for local validation if still needed. Save
the settings and confirm the intended test-account connection is enabled.
The custom API identifier is `https://deskpilot-api`, signing algorithm RS256.
No SPA Client Secret is required or permitted in frontend configuration.

| Configuration | Local | Production |
| --- | --- | --- |
| APP_ENV | local | production |
| LOCAL_DEV_IDENTITY | enabled only for offline tests; disabled for Auth0 | disabled |
| APP_ORIGIN | http://127.0.0.1:8787 | https://deskpilot.diegodgspro.workers.dev |
| AUTH0_ISSUER | ignored .dev.vars | Wrangler server secret; exact `https://<configured-domain>/` including trailing slash |
| AUTH0_AUDIENCE | https://deskpilot-api | https://deskpilot-api |
| AUTH0_PERMISSIONS | ignored .dev.vars | Wrangler server secret, never a VITE variable |
| VITE_AUTH0_DOMAIN / VITE_AUTH0_CLIENT_ID / VITE_AUTH0_AUDIENCE | ignored .env.local | supplied to the production build from the same ignored file |
| D1 | local Wrangler persistence | remote DB binding |

The SPA domain and client ID are public in the delivered JavaScript, but their
real values are not committed. The permission map, subjects and credentials must
never enter source control, frontend output, logs, screenshots or PR text.
Local files are inputs only: never upload `.dev.vars` wholesale because it
contains local flags and the loopback origin. Store only the required server
Auth0 settings through Wrangler secrets. Deployments preserve existing secrets.

`node scripts/production.mjs secrets` validates the ignored files and sends only
the issuer and permission map through a private stdin pipe to `wrangler secret
bulk`. Values are never command arguments or printed. On initial setup Wrangler
creates an empty draft Worker to hold secrets; it does not publish the application.
This command can update a live version on later releases, so use it deliberately.
`node scripts/production.mjs build` normalizes checked-out Markdown line endings
while regenerating local artifacts, validates that they remain consistent, builds
with the three existing public SPA settings, and dry-runs the Worker.
`node scripts/production.mjs deploy` requires
clean main matching origin/main, rebuilds, and publishes. Fetch before running it.
The helper suppresses raw subprocess diagnostics because Wrangler may print
bindings; a failure needs private inspection rather than copying raw logs to chat.

## Review, test and release

Run commands from `web/` with Node 22 or newer on PATH unless noted otherwise.
Keep Wrangler authenticated to the intended account. Start feature work from
up-to-date main on a separate branch. Do not deploy feature branches to production.

1. Review the diff, ignored-file status and secret scan. Review each new SQL file.
2. From the root run `.\.venv\Scripts\python.exe -m pytest -q`; on other
   platforms use the project Python interpreter.
3. Run `npm ci`, `npm run typecheck`, `npm test`, `npm run build`, and
   `npm run test:browser`, and `npm audit`. Check generated data with
   `git diff --exit-code -- shared/data.json migrations/0002_synthetic_seed.sql`.
   Browser tests use isolated `.test-build/browser-state`; they do not modify the
   user's normal `.wrangler/state` database. The suite uses synthetic OAuth mocks.
4. Rebuild with real public SPA configuration after browser tests, since the suite
   builds synthetic Auth0 settings. Never publish its fixture build.
5. After all checks pass, review pending backward-compatible remote migrations
   as described below. Commit configuration and documentation, push the branch,
   open a PR and wait for every required CI check on the exact PR head.
6. Review the final diff, squash-merge and delete the feature branch. Switch to
   main and `git pull --ff-only origin main`. Verify a clean tree and matching
   remote main. Rebuild on merged main with production public settings.
7. Apply the reviewed remote migrations from merged main, then run
   `node scripts/production.mjs deploy`, recording the Git commit, deployment/version
   identifier, migration status and validation results in the release record.
   Do not enable dashboard auto-deployment or paid build services.

## Remote D1 migrations

Run `npx wrangler d1 list --json` before provisioning. Reuse this project's exact
database only after checking its identity against `wrangler.json`; never create
a duplicate or reuse an unrelated database. The database UUID is configuration,
not a secret. Never enable a remote binding in local development commands.

```powershell
npx wrangler d1 migrations list DB --remote
# Only after tests pass and the pending SQL has been reviewed:
npx wrangler d1 migrations apply DB --remote
npx wrangler d1 migrations list DB --remote
npx wrangler d1 execute DB --remote --command "SELECT COUNT(*) AS ticket_count FROM tickets; SELECT COUNT(*) AS audit_count FROM audit;"
```

Initial migrations are `0001_schema.sql` (tickets, append-only audit and index)
and `0002_synthetic_seed.sql` (only eight authored incidents, INC-1041–INC-1048).
The seed creates zero audit events; pre-release production inspection found four events from accepted operations. Do not upload local databases, accounts, tokens,
real personal/corporate records, or exports. Remote queries above return counts
only; after login, audit actors are private identifiers and must not be printed.

For future changes, add a new numbered migration. Never edit or regenerate an
already-applied baseline as a way to update production. The sync consistency
check protects the seed baseline; fixture changes require deliberate review and
a separate migration. Test against isolated local D1 first. Prefer additive
schema changes compatible with both current and next Worker versions. Back up
before consequential changes using D1 Time Travel; record a restore bookmark
privately. A destructive migration requires an explicit recovery plan and review.

D1 SQL export does not support databases that contain virtual tables, including
the FTS5 `knowledge_fts` table. Do not treat a D1 export as the knowledge backup
or attempt an export by deleting production objects during a release. The
reviewed `knowledge_base/*.md` corpus, `web/scripts/ingest-knowledge.mjs`
deterministic pipeline, generated `web/knowledge-seed.sql`, and numbered
migrations are the rebuild source of truth. To reconstruct the index in a new or
deliberately recovered database, apply migrations in order, run the reviewed
deterministic ingestion, and verify document/chunk counts plus FTS
synchronization. Never modify or reapply migrations already recorded as applied;
use a new reviewed migration for any future in-place repair.

## Rollback and secret rotation

Inspect `npx wrangler deployments list` and `npx wrangler versions list`. To
restore a known compatible Worker version, use
`npx wrangler rollback <previous-version-id>`. Rollback does not undo D1 changes;
do not roll back code to an incompatible schema. Prefer a forward corrective
migration. D1 Free Time Travel is limited to seven days; a database restore may
discard newer writes and requires deliberate authorization. Record the previous compatible Worker version before every deployment. Fix forward if no compatible rollback target exists.

Update `AUTH0_PERMISSIONS` through Wrangler secret input or a private stdin pipe;
never put the value in a command argument, shell history or chat. `wrangler secret
put AUTH0_PERMISSIONS` rotates the value and deploys a new version immediately,
so perform it as a controlled release. Revoke access by removing the user's grant
server-side. Keep at least one intended authorized account and verify both read
and write boundaries afterward. Rotate the issuer only when changing tenants,
and rebuild the SPA for tenant/client/audience changes. Auth0 signing-key rotation
uses JWKS; unknown keys refresh subject to cooldown, and verification failures
deny access. No SPA client secret needs rotation.

References: [Worker secrets](https://developers.cloudflare.com/workers/configuration/secrets/),
[rollback](https://developers.cloudflare.com/workers/configuration/versions-and-deployments/rollbacks/),
[D1 Time Travel](https://developers.cloudflare.com/d1/reference/time-travel/).

## Production acceptance

Check the public page and its JavaScript/CSS return 200. `/auth/local` must return
`{"enabled":false}`. Anonymous, malformed-bearer and forged identity-header API
requests must return 401, including mutation requests. Verify the deployed DB
binding through authenticated Cloudflare management metadata, never a public
diagnostic endpoint. No endpoint should expose deployment secrets.

The following manual checklist is retained for future releases; the user completed production login, reads, a persisted write and logout for v1.0.0:

1. Save the three production URL lists above. Open a private browser at the exact
   production URL, confirm the login screen and absence of the local test button.
2. Sign in through Universal Login with the already-authorized test account.
   Confirm return to the production hostname and successful loading of eight
   synthetic incidents. Never copy tokens or account identifiers into a report.
3. Open a synthetic incident and analyze it. Confirm the operation succeeds and
   the resulting state persists after refresh. Review the audit privately.
   Simulations must remain simulations; no external IT operation runs.
4. Sign out, verify the protected workspace disappears, then sign in again.
   Test reload/session recovery; another login may be needed under browser cookie
   restrictions. A signed-in account without a server grant must receive 403;
   a read-only account must load data but receive 403 on mutations.
5. Record pass/fail without identities, permission maps or tokens. If any check
   fails, preserve authentication and investigate configuration or roll back.

## Release recovery checkpoint

Before deploying merged main, record a UTC timestamp and retrieve `npx wrangler d1 time-travel info DB --json`. Store the bookmark privately outside Git; publish only retrieval status and timestamp. This read-only operation does not restore data or enable a paid feature. Record the new deployment/version IDs and traffic allocation in the GitHub Release after verification.

`web/wrangler.json` is strict JSON and has no comments. Its production flags deliberately disable local identity and preview URLs; its DB binding targets the existing remote D1 database. Local commands explicitly use local D1. Do not add a paid service binding or change the production origin.
