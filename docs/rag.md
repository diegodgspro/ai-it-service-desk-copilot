# Enterprise retrieval foundation

DeskPilot v1.2.0 adds deterministic retrieval for approved synthetic IT support knowledge. It is a foundation for possible future retrieval-augmented generation (RAG), not an LLM, semantic search, or generated-answer feature. No external network call, embedding model, vector database, Workers AI binding, AI Gateway, API key, or paid fallback is used.

## Ingestion and review

Only files matching `knowledge_base/[a-z0-9-]+.md` are enumerated. Every article requires the complete metadata contract: stable ID, title, source type, service, category, product, operating system, language, approval status, version, last-reviewed date, tags, and `synthetic-demo` classification. Unknown, missing, or malformed metadata fails ingestion. The pipeline never scans arbitrary repository paths, `.env` files, logs, uploads, or user content.

Run `npm run knowledge:prepare` in `web/`. It parses locally, splits on authored Markdown headings, preserves headings and source paths, and derives SHA-256 hashes and stable chunk IDs from document ID, ordinal, and heading. Identical input produces identical JSON and SQL. The generated seed upserts documents and replaces only their child chunks, making repeated local ingestion idempotent. `npm run knowledge:ingest:local` applies it only to local D1. Remote migration and ingestion are excluded.

To add an article safely, copy an existing metadata shape, use only reviewed synthetic content, choose an immutable descriptive ID, keep status `draft` during review, and update the review date/version before approval. Run sync, retrieval tests, and inspect generated changes. Never paste tickets, credentials, tokens, corporate runbooks, personal data, or instructions from an untrusted source.

## Storage, retrieval, and citations

Migration `0004_enterprise_knowledge_fts.sql` adds normalized document and chunk tables, foreign-key cascade, metadata indexes, an FTS5 index, and synchronization triggers. Earlier migrations remain unchanged. Retrieval uses Unicode token normalization, safely quoted FTS terms, BM25 ordering, exact allowlisted metadata parameters, a server maximum of 10 results, a default 0.5 term-coverage threshold, duplicate suppression, and deterministic document/chunk tie-breaks. Only `approved` rows are eligible.

Results include a sanitized plain-text excerpt, observable matched terms, metadata, and a stable `document@version#chunk` citation. The API accepts at most 500 query characters and the Worker's existing 16 KB JSON limit. Auth0 verification, server-owned `read` permission, exact-origin checks, and JSON enforcement protect `POST /api/knowledge/retrieve`; retrieval does not require `write`.

## Evaluation

The reviewed synthetic golden set has 12 cases covering Active Directory/account access, VPN and DNS, Microsoft 365/email, printing, workstation storage/performance, ERP, permissions, general software, ambiguity, and two irrelevant abstention cases. Baseline: Recall@1 **0.90**, Recall@3 **1.00**, MRR **0.95**, metadata-filter correctness **1.00**, approved-only enforcement **1.00**, abstention accuracy **1.00**, and repeatability **1.00**. Enforced thresholds are 0.80, 0.90, 0.85, and 0.90 respectively. This small authored dataset measures regression behavior, not production quality or semantic understanding.

## Trust boundary and limitations

Article text is untrusted evidence. It is rendered as React text, never HTML, and cannot alter authentication, authorization, priority, diagnosis, action selection, automation approval, handover, or closure policy. The application returns evidence, not hidden reasoning, and explains matches only with terms and metadata. Technicians must validate expanded evidence independently.

Lexical retrieval depends on shared words, does not understand meaning or negation, and may miss synonyms or rank ambiguity imperfectly. English is the only reviewed corpus. Future `Embedder` and `Reranker` interfaces are types only. Vectorize or Workers AI requires a separate eligibility, privacy, security, cost, and explicit-authorization review; there is no automatic fallback.
