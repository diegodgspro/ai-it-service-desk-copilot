export const approvalStatuses = ["draft", "approved", "retired"] as const;
export const sourceTypes = ["runbook", "policy"] as const;
export type ApprovalStatus = (typeof approvalStatuses)[number];
export type KnowledgeMetadata = {
  documentId: string;
  title: string;
  sourceType: (typeof sourceTypes)[number];
  service: string;
  category: string;
  product: string;
  operatingSystem?: string;
  language: string;
  approvalStatus: ApprovalStatus;
  version: string;
  lastReviewed: string;
  tags: string[];
  classification: "synthetic-demo";
};
export type KnowledgeDocument = KnowledgeMetadata & {
  sourcePath: string;
  content: string;
};
export type KnowledgeChunk = {
  chunkId: string;
  documentId: string;
  ordinal: number;
  heading: string;
  content: string;
  contentHash: string;
};
export type RetrievalFilters = {
  service?: string;
  category?: string;
  product?: string;
  language?: string;
  approvalStatus?: ApprovalStatus;
};
export type RetrievalQuery = {
  query: string;
  filters?: RetrievalFilters;
  topK?: number;
  minScore?: number;
};
export type Citation = { documentId: string; chunkId: string; label: string };
export type RetrievalResult = {
  documentId: string;
  chunkId: string;
  title: string;
  heading: string;
  excerpt: string;
  score: number;
  matchedTerms: string[];
  matchReason: string;
  metadata: KnowledgeMetadata;
  citation: Citation;
};
export type EvaluationCase = {
  id: string;
  query: RetrievalQuery;
  expectedDocumentIds: string[];
  shouldAbstain: boolean;
};
export type EvaluationResult = {
  cases: number;
  recallAt1: number;
  recallAt3: number;
  meanReciprocalRank: number;
  metadataFilterCorrectness: number;
  approvedOnlyEnforcement: number;
  abstentionAccuracy: number;
  deterministicRepeatability: number;
};

const text = (x: unknown, max = 200) =>
  typeof x === "string" && !!x.trim() && x.length <= max;
const id = (x: unknown) =>
  typeof x === "string" &&
  /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(x) &&
  x.length <= 100;
export function validateMetadata(value: unknown): value is KnowledgeMetadata {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const x = value as Record<string, unknown>;
  const keys = [
    "documentId",
    "title",
    "sourceType",
    "service",
    "category",
    "product",
    "operatingSystem",
    "language",
    "approvalStatus",
    "version",
    "lastReviewed",
    "tags",
    "classification",
  ];
  return (
    !Object.keys(x).some((k) => !keys.includes(k)) &&
    id(x.documentId) &&
    text(x.title) &&
    sourceTypes.includes(x.sourceType as never) &&
    text(x.service, 120) &&
    text(x.category, 120) &&
    text(x.product, 120) &&
    (x.operatingSystem === undefined || text(x.operatingSystem, 80)) &&
    typeof x.language === "string" &&
    /^[a-z]{2}(?:-[A-Z]{2})?$/.test(x.language) &&
    approvalStatuses.includes(x.approvalStatus as never) &&
    typeof x.version === "string" &&
    /^\d+\.\d+$/.test(x.version) &&
    typeof x.lastReviewed === "string" &&
    /^\d{4}-\d{2}-\d{2}$/.test(x.lastReviewed) &&
    !Number.isNaN(Date.parse(x.lastReviewed + "T00:00:00Z")) &&
    Array.isArray(x.tags) &&
    x.tags.length <= 12 &&
    x.tags.every((t) => text(t, 60)) &&
    x.classification === "synthetic-demo"
  );
}
export function validateRetrievalQuery(
  value: unknown,
): value is RetrievalQuery {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const x = value as Record<string, unknown>,
    f = x.filters as Record<string, unknown> | undefined;
  if (
    Object.keys(x).some(
      (k) => !["query", "filters", "topK", "minScore"].includes(k),
    ) ||
    !text(x.query, 500) ||
    (x.topK !== undefined &&
      (!Number.isInteger(x.topK) ||
        Number(x.topK) < 1 ||
        Number(x.topK) > 20)) ||
    (x.minScore !== undefined &&
      (typeof x.minScore !== "number" || x.minScore < 0 || x.minScore > 1))
  )
    return false;
  return (
    !f ||
    (typeof f === "object" &&
      !Array.isArray(f) &&
      !Object.keys(f).some(
        (k) =>
          ![
            "service",
            "category",
            "product",
            "language",
            "approvalStatus",
          ].includes(k),
      ) &&
      Object.values(f).every((v) => text(v, 120)) &&
      (f.approvalStatus === undefined ||
        approvalStatuses.includes(f.approvalStatus as never)))
  );
}

export interface Retriever {
  retrieve(query: RetrievalQuery): Promise<RetrievalResult[]>;
}
export interface Embedder {
  readonly kind: "future-optional";
  embed(texts: string[]): Promise<number[][]>;
}
export interface Reranker {
  readonly kind: "future-optional";
  rerank(query: string, results: RetrievalResult[]): Promise<RetrievalResult[]>;
}
