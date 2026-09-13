# Changelog

All notable changes follow [Keep a Changelog](https://keepachangelog.com/en/1.1.0/). The web package uses semantic versioning.

## [Unreleased]

## [1.2.0] - 2026-09-13

### Fixed

- Normalize UTF-8 BOMs and CRLF or standalone CR line endings before reviewed Markdown parsing, hashing, chunking, and artifact generation, keeping RAG IDs, hashes, JSON, SQL, and production build validation deterministic across platforms.

### Added

- D1 FTS5 lexical retrieval over 10 reviewed synthetic documents and 46 stable heading chunks, with approved-only filters, relevance controls, safe excerpts, and stable citations.
- Authenticated incident and intake knowledge evidence plus a 12-case deterministic evaluation suite.

### Security

- Allowlisted offline ingestion rejects malformed metadata and arbitrary repository content; retrieved text cannot change policy or authorization.
- No LLM, embeddings, vector service, Workers AI, AI Gateway, API key, paid resource, or paid fallback is included.

## [1.1.0] - 2026-09-11

### Added

- Authenticated intelligent ticket intake with an editable canonical draft, relevant missing-information questions, explicit confirmation, and client-side draft state.
- A provider-independent intake contract and deterministic local provider for common synthetic support signals.
- Confirmed creation with collision-resistant identifiers, structured-intake origin metadata, and append-only audit events.

### Security

- Intake writes retain Auth0, server-owned grants, exact-origin checks, JSON and size enforcement, strict schema validation, and safe errors.
- Suggestions are deterministic and suspected causes are unconfirmed hypotheses. Priority always comes from the impact × urgency policy.

## [1.0.0] - 2026-09-10

### Added

- Python/Streamlit MVP with local classification, knowledge retrieval, mock handovers and optional narrative-provider contract.
- React/TypeScript production dashboard with deterministic incident analysis, knowledge evidence and troubleshooting.
- Human-approved simulated actions, stale-decision invalidation and restoration confirmation.
- Auth0 Universal Login, Worker-side RS256 validation and explicit server-side read/write permissions.
- Cloudflare Worker deployment at https://deskpilot.diegodgspro.workers.dev with D1 persistence and append-only audit events.
- Automated Python, Worker/D1, frontend and browser tests, TypeScript validation and GitHub Actions CI.
- Deployment, rollback, production acceptance and security documentation.

### Changed

- Established the production portfolio checkpoint and aligned documentation with accepted behavior.
- Set the canonical web version to 1.0.0; the Python lab remains unpackaged.

### Security

- Fail-closed API authentication, server-owned grants and exact-origin mutation checks; local identity disabled in production.
- Ignored local configuration, placeholder-only examples and private audit identities excluded from public release records.

### Known limitations

- Synthetic data and simulated automation only; no operational ITSM integration or command execution.
- Working hypotheses, not confirmed causes; no production LLM enabled.
- Bounded queue/audit display, no historical analysis archive, multi-tenancy or enterprise SLA. Free quotas apply with no paid fallback.

[Unreleased]: https://github.com/diegodgspro/ai-it-service-desk-copilot/compare/v1.2.0...HEAD
[1.2.0]: https://github.com/diegodgspro/ai-it-service-desk-copilot/releases/tag/v1.2.0
[1.1.0]: https://github.com/diegodgspro/ai-it-service-desk-copilot/releases/tag/v1.1.0
[1.0.0]: https://github.com/diegodgspro/ai-it-service-desk-copilot/releases/tag/v1.0.0
