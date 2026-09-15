export const feedbackOutcomes = ["helpful", "not_helpful"] as const;
export const helpfulReasons = ["relevant", "actionable", "clear"] as const;
export const notHelpfulReasons = [
  "irrelevant",
  "wrong_service",
  "outdated",
  "insufficient_detail",
  "duplicate",
  "unsafe_or_inapplicable",
] as const;
export type FeedbackOutcome = (typeof feedbackOutcomes)[number];
export type FeedbackReason =
  | (typeof helpfulReasons)[number]
  | (typeof notHelpfulReasons)[number];
export type RetrievalContext = {
  incidentId?: string;
  incidentVersion?: number;
  analysisContextId?: string;
};
export type KnowledgeFeedbackInput = {
  clientEventId: string;
  retrievalId: string;
  documentId: string;
  chunkId: string;
  citation: string;
  documentVersion: string;
  documentHash: string;
  outcome: FeedbackOutcome;
  reason: FeedbackReason;
  supersedesFeedbackId?: string;
};
export type KnowledgeFeedbackReceipt = {
  feedbackId: string;
  createdAt: string;
  duplicate: boolean;
};
export type FeedbackSummary = {
  retrievedEvidenceCount: number;
  evaluatedEvidenceCount: number;
  feedbackCoveragePercent: number;
  helpfulPercent: number | null;
  reasons: { reason: FeedbackReason; count: number }[];
  documents: { documentId: string; category: string; count: number; helpfulPercent: number }[];
};

const id = (value: unknown, max = 120) =>
  typeof value === "string" &&
  value.length <= max &&
  /^[a-zA-Z0-9][a-zA-Z0-9:_-]*$/.test(value);
export function validateRetrievalContext(value: unknown): value is RetrievalContext {
  if (value === undefined) return true;
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const x = value as Record<string, unknown>;
  if (Object.keys(x).some((key) => !["incidentId", "incidentVersion", "analysisContextId"].includes(key))) return false;
  if (x.incidentId !== undefined && (typeof x.incidentId !== "string" || !/^INC-\d+$/.test(x.incidentId))) return false;
  if (x.incidentVersion !== undefined && (!Number.isInteger(x.incidentVersion) || Number(x.incidentVersion) < 1)) return false;
  if ((x.incidentId === undefined) !== (x.incidentVersion === undefined)) return false;
  return x.analysisContextId === undefined || id(x.analysisContextId);
}
export function validateKnowledgeFeedback(value: unknown): value is KnowledgeFeedbackInput {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const x = value as Record<string, unknown>;
  const keys = ["clientEventId", "retrievalId", "documentId", "chunkId", "citation", "documentVersion", "documentHash", "outcome", "reason", "supersedesFeedbackId"];
  if (Object.keys(x).some((key) => !keys.includes(key))) return false;
  if (!id(x.clientEventId) || !id(x.retrievalId) || !id(x.documentId, 100) || !id(x.chunkId, 120)) return false;
  if (typeof x.citation !== "string" || x.citation.length > 260 || !/^[a-z0-9-]+@\d+\.\d+#[a-zA-Z0-9:_-]+$/.test(x.citation)) return false;
  if (typeof x.documentVersion !== "string" || !/^\d+\.\d+$/.test(x.documentVersion)) return false;
  if (typeof x.documentHash !== "string" || !/^[a-f0-9]{64}$/.test(x.documentHash)) return false;
  if (x.supersedesFeedbackId !== undefined && !id(x.supersedesFeedbackId)) return false;
  if (!feedbackOutcomes.includes(x.outcome as FeedbackOutcome)) return false;
  return x.outcome === "helpful"
    ? helpfulReasons.includes(x.reason as never)
    : notHelpfulReasons.includes(x.reason as never);
}
