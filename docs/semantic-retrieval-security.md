# Semantic retrieval laboratory: security boundary

DeskPilot v1.3.0 treats semantic and hybrid retrieval as a local/CI experiment,
not as a production capability. Production remains on authenticated D1 FTS5
lexical retrieval. The experiment does not add a Cloudflare Vectorize index,
Workers AI call, remote AI binding, credential, remote migration, or deployment.

## Trust boundaries and invariants

- Retrieved chunks and embedding inputs are untrusted evidence. Their text and
  similarity scores cannot grant access, select priority, confirm an incident,
  choose or execute an action, approve a simulation, control handover, or close
  an incident.
- Authentication and server-owned `read`/`write` grants remain outside the
  retrieval provider. The existing same-origin and JSON checks remain in force.
- Candidate documents must be approved before ranking. Exact allowlisted
  metadata and language filters, duplicate suppression, stable citations,
  sanitized excerpts, bounded result counts, and abstention are enforced on the
  final result set as well as on provider candidates.
- Document and chunk IDs are the authoritative join keys. Vector position,
  provider order, model output, and retrieved text cannot create or replace an
  identity or citation.
- Semantic mode is deny-by-default outside the explicit local/CI laboratory
  flag. Missing or invalid configuration must not enable it. The production
  Wrangler configuration contains no semantic, Vectorize, Workers AI, or remote
  model binding.

## Fail-safe behavior and resource bounds

Every semantic failure returns the bounded lexical result for the same validated
query and filters. Covered failures include an unavailable provider or model,
timeout, exception, wrong vector count, dimensions other than 384, empty or
non-finite values, a zero-norm vector, and a result referencing an unknown or
ineligible chunk. Hybrid mode also falls back to lexical when its semantic side
fails; it must not return a partial semantic-only result.

Embedding calls are bounded by input length, corpus size, batch size, execution
time, and the existing result limit. Reciprocal-rank fusion uses a fixed rank
constant and candidate cap, deterministic document/chunk tie-breaks, and no
unbounded score or provider-controlled weight. Provider diagnostics must not
include ticket text, chunk bodies, tokens, identities, permission maps, local
paths, or environment values.

## Dependencies and model handling

The ordinary Python and Worker production installations must remain independent
of the optional semantic stack. Model setup is an explicit local action and
ordinary tests, CI fixtures, production builds, and Worker startup must not
download a model. CI uses a deterministic fixture provider unless a separately
reviewed cache and network-free job is deliberately configured.

The selected model must be the pinned BGE Small English v1.5 family with its
source, license, exact revision/files, 384 dimensions, normalization behavior,
and checksums recorded before use. Model binaries and caches are ignored and are
never committed. Stop before installation if acquisition needs credentials,
paid access or terms, an incompatible license, an unreviewed executable, or an
unavoidable runtime network dependency.

## Promotion gate

Passing experimental metrics does not enable production semantic retrieval.
Promotion requires a separate review and explicit authorization after all stated
quality criteria pass, approved-only and filter correctness remain 1.00,
citations are stable, irrelevant-query abstention does not materially regress,
every provider-failure case falls back to lexical, and authentication and
authorization regressions remain zero. Cloudflare configuration and production
traffic are out of scope for this branch.
