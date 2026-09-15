import { validateKnowledgeFeedback, type FeedbackSummary, type KnowledgeFeedbackInput } from "../shared/feedback";

export const digest = async (value: string) =>
  Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode("deskpilot-feedback-v1\0" + value))))
    .map((x) => x.toString(16).padStart(2, "0")).join("");

type ContextRow = { actor_hash: string; incident_id: string | null; incident_version: number | null; analysis_context_id: string | null };
type CorpusRow = { document_id: string; chunk_id: string; version: string; content_hash: string; approval_status: string };
type ExistingRow = { feedback_id: string; created_at: string };

export async function recordFeedback(db: D1Database, actor: string, value: unknown) {
  if (!validateKnowledgeFeedback(value)) return { error: "Invalid feedback.", status: 400 } as const;
  const input = value as KnowledgeFeedbackInput;
  const actorHash = await digest(actor);
  const existing = await db.prepare("SELECT feedback_id,created_at FROM knowledge_feedback WHERE actor_hash=? AND client_event_id=?")
    .bind(actorHash, input.clientEventId).first<ExistingRow>();
  if (existing) return { receipt: { feedbackId: existing.feedback_id, createdAt: existing.created_at, duplicate: true }, status: 200 } as const;
  const context = await db.prepare("SELECT actor_hash,incident_id,incident_version,analysis_context_id FROM knowledge_retrieval_events WHERE retrieval_id=?")
    .bind(input.retrievalId).first<ContextRow>();
  if (!context || context.actor_hash !== actorHash) return { error: "The retrieval context is invalid.", status: 400 } as const;
  const corpus = await db.prepare("SELECT d.document_id,c.chunk_id,d.version,d.content_hash,d.approval_status FROM knowledge_retrieval_items i JOIN knowledge_chunks c ON c.chunk_id=i.chunk_id AND c.document_id=i.document_id JOIN knowledge_documents d ON d.document_id=c.document_id WHERE i.retrieval_id=? AND i.document_id=? AND i.chunk_id=?")
    .bind(input.retrievalId, input.documentId, input.chunkId).first<CorpusRow>();
  if (!corpus || corpus.approval_status !== "approved") return { error: "The approved evidence is invalid.", status: 400 } as const;
  const citation = `${corpus.document_id}@${corpus.version}#${corpus.chunk_id}`;
  if (citation !== input.citation || corpus.version !== input.documentVersion || corpus.content_hash !== input.documentHash)
    return { error: "The evidence citation is invalid.", status: 400 } as const;
  if (input.supersedesFeedbackId) {
    const prior = await db.prepare("SELECT feedback_id FROM knowledge_feedback WHERE feedback_id=? AND actor_hash=? AND retrieval_id=? AND document_id=? AND chunk_id=?")
      .bind(input.supersedesFeedbackId, actorHash, input.retrievalId, input.documentId, input.chunkId).first();
    if (!prior) return { error: "The feedback correction is invalid.", status: 400 } as const;
  } else {
    const prior = await db.prepare("SELECT feedback_id FROM knowledge_feedback f WHERE actor_hash=? AND retrieval_id=? AND document_id=? AND chunk_id=? AND NOT EXISTS(SELECT 1 FROM knowledge_feedback n WHERE n.supersedes_feedback_id=f.feedback_id)")
      .bind(actorHash,input.retrievalId,input.documentId,input.chunkId).first();
    if (prior) return { error: "Existing feedback must be corrected, not duplicated.", status: 409 } as const;
  }
  const feedbackId = crypto.randomUUID();
  try {
    await db.prepare("INSERT INTO knowledge_feedback(feedback_id,client_event_id,actor_hash,retrieval_id,incident_id,incident_version,analysis_context_id,retrieval_mode,document_id,chunk_id,citation,document_version,document_hash,outcome,reason,supersedes_feedback_id) VALUES(?,?,?,?,?,?,?,'lexical',?,?,?,?,?,?,?,?)")
      .bind(feedbackId,input.clientEventId,actorHash,input.retrievalId,context.incident_id,context.incident_version,context.analysis_context_id,input.documentId,input.chunkId,citation,corpus.version,corpus.content_hash,input.outcome,input.reason,input.supersedesFeedbackId ?? null).run();
  } catch {
    const duplicate = await db.prepare("SELECT feedback_id,created_at FROM knowledge_feedback WHERE actor_hash=? AND client_event_id=?")
      .bind(actorHash,input.clientEventId).first<ExistingRow>();
    if (duplicate) return { receipt: { feedbackId: duplicate.feedback_id, createdAt: duplicate.created_at, duplicate: true }, status: 200 } as const;
    throw new Error("feedback persistence failed");
  }
  const saved = await db.prepare("SELECT feedback_id,created_at FROM knowledge_feedback WHERE feedback_id=?").bind(feedbackId).first<ExistingRow>();
  return { receipt: { feedbackId, createdAt: saved!.created_at, duplicate: false }, status: 201 } as const;
}

export async function feedbackSummary(db: D1Database): Promise<FeedbackSummary> {
  const current = "WITH current_feedback AS (SELECT f.* FROM knowledge_feedback f WHERE NOT EXISTS(SELECT 1 FROM knowledge_feedback n WHERE n.supersedes_feedback_id=f.feedback_id))";
  const totals = await db.prepare(`${current} SELECT COUNT(*) evaluated,SUM(outcome='helpful') helpful FROM current_feedback`).first<{evaluated:number;helpful:number|null}>();
  const retrieved = await db.prepare("SELECT COALESCE(SUM(result_count),0) count FROM knowledge_retrieval_events").first<{count:number}>();
  const reasons = await db.prepare(`${current} SELECT reason,COUNT(*) count FROM current_feedback GROUP BY reason ORDER BY count DESC,reason LIMIT 9`).all<{reason: FeedbackSummary["reasons"][number]["reason"];count:number}>();
  const documents = await db.prepare(`${current} SELECT f.document_id,d.category,COUNT(*) count,ROUND(100.0*SUM(f.outcome='helpful')/COUNT(*),1) helpfulPercent FROM current_feedback f JOIN knowledge_documents d ON d.document_id=f.document_id GROUP BY f.document_id,d.category ORDER BY count DESC,f.document_id LIMIT 10`).all<{document_id:string;category:string;count:number;helpfulPercent:number}>();
  const evaluated = totals?.evaluated ?? 0, shown = retrieved?.count ?? 0;
  return {
    retrievedEvidenceCount: shown,
    evaluatedEvidenceCount: evaluated,
    feedbackCoveragePercent: shown ? Number((100 * evaluated / shown).toFixed(1)) : 0,
    helpfulPercent: evaluated ? Number((100 * (totals?.helpful ?? 0) / evaluated).toFixed(1)) : null,
    reasons: reasons.results,
    documents: documents.results.map((x) => ({ documentId:x.document_id,category:x.category,count:x.count,helpfulPercent:x.helpfulPercent })),
  };
}
