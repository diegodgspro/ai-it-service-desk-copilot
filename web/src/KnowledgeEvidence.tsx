import React, { useEffect, useRef, useState } from "react";
import type { RetrievalFilters, RetrievalResult } from "../shared/knowledge";
import { helpfulReasons, notHelpfulReasons, type FeedbackOutcome, type FeedbackReason, type FeedbackSummary, type KnowledgeFeedbackReceipt, type RetrievalContext } from "../shared/feedback";
import type { Api } from "./api";
export function KnowledgeEvidence({
  api,
  query,
  filters,
  label = "Knowledge evidence",
  context,
}: {
  api: Api;
  query: string;
  filters?: RetrievalFilters;
  label?: string;
  context?: RetrievalContext;
}) {
  const [results, setResults] = useState<RetrievalResult[] | null>(null),
    [retrievalId, setRetrievalId] = useState(""), [summary, setSummary] = useState<FeedbackSummary | null>(null),
    [error, setError] = useState("");
  const refreshSummary = () => api<FeedbackSummary>("/knowledge/feedback/summary").then((x) => {
    if (x && (x.status === "insufficient_sample" || (x.status === "available" && Array.isArray(x.reasons) && Array.isArray(x.documents)))) setSummary(x);
  }).catch(() => {});
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
    void api<{ results: RetrievalResult[]; retrievalId: string }>("/knowledge/retrieve", "POST", {
      query,
      filters,
      context,
      topK: 3,
      minScore: 0.5,
    })
      .then((x) => {
        if (live) { setResults(Array.isArray(x.results) ? x.results : []); setRetrievalId(x.retrievalId); void refreshSummary(); }
      })
      .catch((e) => {
        if (live) setError((e as Error).message);
      });
    return () => {
      live = false;
    };
  }, [api, query, JSON.stringify(filters), JSON.stringify(context)]);
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
              <EvidenceFeedback api={api} evidence={r} retrievalId={retrievalId} onSaved={refreshSummary} />
            </div>
          </details>
        ))
      )}
      {summary && <aside className="retrieval-quality" aria-labelledby="retrieval-quality-title">
        <h4 id="retrieval-quality-title">Retrieval quality</h4>
        {summary.status === "insufficient_sample" ? <p>Insufficient sample. Aggregates require at least five valid feedback events.</p> : <>
        <p><strong>{summary.evaluatedEvidenceCount}</strong> evaluated · <strong>{summary.feedbackCoveragePercent}%</strong> feedback coverage · <strong>{summary.helpfulPercent === null ? "—" : `${summary.helpfulPercent}%`}</strong> helpful</p>
        {summary.reasons.length>0&&<p>Reasons: {summary.reasons.map(x=>`${x.reason.replaceAll("_"," ")} (${x.count})`).join(" · ")}</p>}
        {summary.documents.length>0&&<p>Top evidence: {summary.documents.map(x=>`${x.documentId} / ${x.category} (${x.count})`).join(" · ")}</p>}
        </>}
        <p className="muted">Aggregated human lab feedback, not accuracy or ground truth.</p>
      </aside>}
    </section>
  );
}

function EvidenceFeedback({api,evidence,retrievalId,onSaved}:{api:Api;evidence:RetrievalResult;retrievalId:string;onSaved:()=>void}) {
  const [outcome,setOutcome]=useState<FeedbackOutcome>("helpful"), [reason,setReason]=useState<FeedbackReason>("relevant");
  const [busy,setBusy]=useState(false), [error,setError]=useState(""), [receipt,setReceipt]=useState<KnowledgeFeedbackReceipt|null>(null), [clientEventId,setClientEventId]=useState("");
  const errorRef=useRef<HTMLDivElement>(null), statusRef=useRef<HTMLParagraphElement>(null);
  useEffect(()=>{ if(error) errorRef.current?.focus(); },[error]);
  useEffect(()=>{ if(receipt) statusRef.current?.focus(); },[receipt]);
  const reasons = outcome === "helpful" ? helpfulReasons : notHelpfulReasons;
  async function save() {
    const eventId=clientEventId || crypto.randomUUID(); if(!clientEventId)setClientEventId(eventId);
    setBusy(true);setError("");
    try { const saved=await api<KnowledgeFeedbackReceipt>("/knowledge/feedback","POST",{clientEventId:eventId,retrievalId,documentId:evidence.documentId,chunkId:evidence.chunkId,citation:evidence.citation.label,documentVersion:evidence.metadata.version,documentHash:evidence.documentHash,outcome,reason,...(receipt?{supersedesFeedbackId:receipt.feedbackId}:{})}); setReceipt(saved);setClientEventId("");onSaved(); }
    catch(e){setError((e as Error).message);} finally{setBusy(false)}
  }
  return <fieldset className="evidence-feedback"><legend>Was this evidence helpful?</legend>
    <div className="feedback-outcomes">{(["helpful","not_helpful"] as const).map(x=><label key={x}><input type="radio" name={`outcome-${evidence.chunkId}`} checked={outcome===x} onChange={()=>{setOutcome(x);setReason(x==="helpful"?"relevant":"irrelevant")}}/> {x==="helpful"?"Helpful":"Not helpful"}</label>)}</div>
    <label>Reason<select value={reason} onChange={e=>setReason(e.target.value as FeedbackReason)}>{reasons.map(x=><option key={x} value={x}>{x.replaceAll("_"," ")}</option>)}</select></label>
    <button className="secondary" disabled={busy||!retrievalId} onClick={()=>void save()}>{busy?"Saving…":receipt?"Save correction":"Save feedback"}</button>
    {receipt&&<p ref={statusRef} tabIndex={-1} role="status" className="feedback-saved">Feedback saved. Corrections create a new history event.</p>}
    {error&&<div ref={errorRef} tabIndex={-1} role="alert" className="alert error">{error} <button className="secondary" onClick={()=>void save()}>Retry</button></div>}
  </fieldset>;
}
