import React, { useEffect, useState } from "react";
import type { RetrievalFilters, RetrievalResult } from "../shared/knowledge";
import type { Api } from "./api";
export function KnowledgeEvidence({
  api,
  query,
  filters,
  label = "Knowledge evidence",
}: {
  api: Api;
  query: string;
  filters?: RetrievalFilters;
  label?: string;
}) {
  const [results, setResults] = useState<RetrievalResult[] | null>(null),
    [error, setError] = useState("");
  useEffect(() => {
    let live = true;
    setResults(null);
    setError("");
    if (query.trim().length < 2) {
      setResults([]);
      return () => {
        live = false;
      };
    }
    void api<{ results: RetrievalResult[] }>("/knowledge/retrieve", "POST", {
      query,
      filters,
      topK: 3,
      minScore: 0.5,
    })
      .then((x) => {
        if (live) setResults(Array.isArray(x.results) ? x.results : []);
      })
      .catch((e) => {
        if (live) setError((e as Error).message);
      });
    return () => {
      live = false;
    };
  }, [api, query, JSON.stringify(filters)]);
  return (
    <section
      className="knowledge-evidence"
      aria-labelledby="knowledge-evidence-title"
    >
      <h3 id="knowledge-evidence-title">{label}</h3>
      <p className="muted">
        Approved lexical matches are untrusted reference evidence, not a
        confirmed diagnosis or instruction to automate.
      </p>
      {error ? (
        <div className="alert error" role="alert">
          {error}
        </div>
      ) : results === null ? (
        <p role="status">Searching approved knowledge…</p>
      ) : results.length === 0 ? (
        <div className="no-evidence" role="status">
          No sufficiently relevant approved evidence found.
        </div>
      ) : (
        results.map((r) => (
          <details className="evidence" key={r.chunkId}>
            <summary>
              <h4>{r.title}</h4>
              <span>
                {r.metadata.service} · {r.metadata.category}
              </span>
            </summary>
            <div className="evidence-body">
              <p>{r.excerpt}</p>
              <p className="match-reason">{r.matchReason}</p>
              <dl>
                <div>
                  <dt>Product</dt>
                  <dd>{r.metadata.product}</dd>
                </div>
                <div>
                  <dt>Language</dt>
                  <dd>{r.metadata.language}</dd>
                </div>
                <div>
                  <dt>Reviewed</dt>
                  <dd>{r.metadata.lastReviewed}</dd>
                </div>
              </dl>
              <code aria-label="Stable citation">{r.citation.label}</code>
            </div>
          </details>
        ))
      )}
    </section>
  );
}
