# DeskPilot toy pipeline preflight

Status: **passed**.

This challenge-blind run used three unrelated toy documents and queries in a fresh local D1 database plus the verified offline BGE model.

- Lexical Recall@3: 1.000
- Semantic Recall@3: 1.000
- Hybrid Recall@3: 1.000
- Abstention TP (lexical/semantic/hybrid): 1/1/1
- Exact D1 schema, semantic timeout/fallback, deterministic repeatability, independent recalculation, citations, identities, filtering, approved-only policy, and sanitization: passed.
- Challenge content accessed: no.
