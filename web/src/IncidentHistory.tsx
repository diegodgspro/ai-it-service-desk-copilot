import React, { useEffect, useRef, useState } from "react";
import type { Api } from "./api";
import type { AnalysisSnapshot, Audit, Page } from "../shared/types";
export function usePages<T>(api: Api, path: string) {
  const [items, setItems] = useState<T[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState("");
  const generation = useRef(0);
  const pending = useRef(false);
  const attempted = useRef<{ next: string | null; reset: boolean }>({
    next: null,
    reset: true,
  });
  async function request(next: string | null, reset = false) {
    if (pending.current && !reset) return;
    const current = reset ? ++generation.current : generation.current;
    pending.current = true;
    attempted.current = { next, reset };
    setBusy(true);
    setError("");
    try {
      const page = await api<Page<T>>(
        path,
        "GET",
        undefined,
        next ? { cursor: next } : undefined,
      );
      if (current !== generation.current) return;
      setItems((old) => (reset ? page.items : [...old, ...page.items]));
      setCursor(page.nextCursor);
    } catch (e) {
      if (current === generation.current) setError((e as Error).message);
    } finally {
      if (current === generation.current) {
        pending.current = false;
        setBusy(false);
      }
    }
  }
  useEffect(() => {
    setItems([]);
    setCursor(null);
    void request(null, true);
    return () => {
      generation.current++;
      pending.current = false;
    };
  }, [api, path]);
  return {
    items,
    setItems,
    cursor,
    busy,
    error,
    refresh: () => request(null, true),
    more: () => request(cursor),
    retry: () => request(attempted.current.next, attempted.current.reset),
  };
}
export function PageControls({
  page,
  label,
  refresh = false,
}: {
  page: Pick<
    ReturnType<typeof usePages>,
    "busy" | "error" | "cursor" | "more" | "retry" | "refresh"
  >;
  label: string;
  refresh?: boolean;
}) {
  const alert = useRef<HTMLDivElement>(null);
  const status = useRef<HTMLParagraphElement>(null);
  const interacted = useRef(false);
  useEffect(() => {
    if (page.error) alert.current?.focus();
    else if (!page.busy && interacted.current) status.current?.focus();
  }, [page.error, page.busy]);
  return (
    <div className="page-controls">
      <p ref={status} aria-live="polite" tabIndex={-1}>
        {page.busy ? `Loading ${label}...` : `${label} loaded.`}
      </p>
      {page.error && (
        <div ref={alert} role="alert" tabIndex={-1}>
          {page.error}{" "}
          <button
            onClick={() => {
              interacted.current = true;
              void page.retry();
            }}
          >
            Retry {label}
          </button>
        </div>
      )}
      {refresh && (
        <button
          disabled={page.busy}
          onClick={() => {
            interacted.current = true;
            void page.refresh();
          }}
        >
          Refresh {label}
        </button>
      )}
      {page.cursor && !page.error && (
        <button
          disabled={page.busy}
          onClick={() => {
            interacted.current = true;
            void page.more();
          }}
        >
          Load more {label}
        </button>
      )}
    </div>
  );
}
export function IncidentHistory({ api, id }: { api: Api; id: string }) {
  const audit = usePages<Audit>(api, `/tickets/${id}/audit`);
  const analyses = usePages<AnalysisSnapshot>(api, `/tickets/${id}/analyses`);
  return (
    <>
      <details className="history">
        <summary>Incident history</summary>
        {!audit.busy && !audit.error && !audit.items.length && (
          <p>No recorded events yet.</p>
        )}
        {audit.items.map((a) => (
          <div key={a.id}>
            <p>
              <b>{a.kind}</b> {a.detail}
              <small>
                {new Date(a.created_at).toLocaleString()} - {a.actor}
              </small>
            </p>
          </div>
        ))}
        <PageControls page={audit} label="audit events" refresh />
      </details>
      <details className="history">
        <summary>Analysis history</summary>
        <p>
          Append-only snapshots. Incidents analyzed before this feature retain
          their current analysis; earlier snapshots were not reconstructed.
          Hypotheses are not confirmed causes.
        </p>
        {!analyses.busy && !analyses.error && !analyses.items.length && (
          <p>No analysis snapshots recorded yet.</p>
        )}
        {analyses.items.map((a) => (
          <article key={a.id}>
            <h3>Incident version {a.incident_version}</h3>
            <p>
              {new Date(a.created_at).toLocaleString()} - {a.actor} - Snapshot
              schema {a.schema_version}
            </p>
            <p>Working hypothesis: {a.analysis.hypothesis}</p>
            <p>Priority: {a.analysis.priority}</p>
            <details>
              <summary>Recorded evidence</summary>
              {a.evidence.map((e, i) => (
                <p key={i}>
                  <b>{e.title}</b> - {e.path}
                </p>
              ))}
            </details>
          </article>
        ))}
        <PageControls page={analyses} label="analyses" refresh />
      </details>
    </>
  );
}
