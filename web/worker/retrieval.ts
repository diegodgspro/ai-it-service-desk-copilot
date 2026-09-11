import type {
  KnowledgeMetadata,
  RetrievalQuery,
  RetrievalResult,
  Retriever,
} from "../shared/knowledge";
const STOP = new Set([
  "a",
  "an",
  "and",
  "are",
  "for",
  "from",
  "in",
  "is",
  "my",
  "of",
  "on",
  "or",
  "the",
  "to",
  "with",
]);
export function normalizeTerms(query: string): string[] {
  return [
    ...new Set(
      query
        .normalize("NFKC")
        .toLowerCase()
        .match(/[\p{L}\p{N}]+/gu)
        ?.filter((x) => x.length > 1 && !STOP.has(x))
        .slice(0, 20) || [],
    ),
  ];
}
export function buildFtsQuery(query: string): string | null {
  const terms = normalizeTerms(query);
  return terms.length
    ? terms.map((x) => `"${x.replaceAll('"', '""')}"`).join(" OR ")
    : null;
}
const safeExcerpt = (value: string, max = 360) =>
  value
    .replace(/[<>\u0000-\u001f\u007f]/g, (c) => (c === "\n" ? " " : ""))
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
type Row = {
  document_id: string;
  chunk_id: string;
  title: string;
  heading: string;
  content: string;
  rank: number;
  source_type: string;
  service: string;
  category: string;
  product: string;
  operating_system: string | null;
  language: string;
  approval_status: "approved";
  version: string;
  last_reviewed: string;
  tags_json: string;
  classification: "synthetic-demo";
};
export class D1FtsRetriever implements Retriever {
  constructor(private db: D1Database) {}
  async retrieve(input: RetrievalQuery): Promise<RetrievalResult[]> {
    const expression = buildFtsQuery(input.query);
    if (!expression) return [];
    const topK = Math.min(input.topK ?? 3, 10),
      threshold = input.minScore ?? 0.5,
      f = input.filters || {};
    const clauses = ["knowledge_fts MATCH ?", "d.approval_status='approved'"],
      binds: unknown[] = [expression];
    for (const [column, value] of [
      ["service", f.service],
      ["category", f.category],
      ["product", f.product],
      ["language", f.language],
    ] as const)
      if (value) {
        clauses.push(`lower(d.${column})=lower(?)`);
        binds.push(value);
      }
    // Callers cannot relax approved-only policy; an explicit non-approved filter abstains.
    if (f.approvalStatus && f.approvalStatus !== "approved") return [];
    const rows = await this.db
      .prepare(
        `SELECT d.document_id,c.chunk_id,d.title,c.heading,c.content,bm25(knowledge_fts,4.0,2.0,1.0) rank,d.source_type,d.service,d.category,d.product,d.operating_system,d.language,d.approval_status,d.version,d.last_reviewed,d.tags_json,d.classification FROM knowledge_fts JOIN knowledge_chunks c ON c.chunk_pk=knowledge_fts.rowid JOIN knowledge_documents d ON d.document_id=c.document_id WHERE ${clauses.join(" AND ")} ORDER BY rank ASC,d.document_id ASC,c.ordinal ASC LIMIT ?`,
      )
      .bind(...binds, Math.min(50, topK * 5))
      .all<Row>();
    const terms = normalizeTerms(input.query),
      seen = new Set<string>(),
      out: RetrievalResult[] = [];
    for (const row of rows.results) {
      const hay = (
          row.title +
          " " +
          row.heading +
          " " +
          row.content
        ).toLowerCase(),
        matched = terms.filter((t) => hay.includes(t)),
        score = Math.min(
          1,
          matched.length / Math.max(2, Math.min(4, terms.length)),
        );
      if (
        score < threshold ||
        seen.has(
          row.document_id + ":" + row.content.replace(/\s/g, "").slice(0, 100),
        )
      )
        continue;
      seen.add(
        row.document_id + ":" + row.content.replace(/\s/g, "").slice(0, 100),
      );
      const metadata: KnowledgeMetadata = {
        documentId: row.document_id,
        title: row.title,
        sourceType: row.source_type as KnowledgeMetadata["sourceType"],
        service: row.service,
        category: row.category,
        product: row.product,
        ...(row.operating_system
          ? { operatingSystem: row.operating_system }
          : {}),
        language: row.language,
        approvalStatus: row.approval_status,
        version: row.version,
        lastReviewed: row.last_reviewed,
        tags: JSON.parse(row.tags_json),
        classification: row.classification,
      };
      out.push({
        documentId: row.document_id,
        chunkId: row.chunk_id,
        title: row.title,
        heading: row.heading,
        excerpt: safeExcerpt(row.content),
        score: Number(score.toFixed(4)),
        matchedTerms: matched,
        matchReason: `Matched terms: ${matched.join(", ")}${f.service ? `; service: ${f.service}` : ""}${f.category ? `; category: ${f.category}` : ""}`,
        metadata,
        citation: {
          documentId: row.document_id,
          chunkId: row.chunk_id,
          label: `${row.document_id}@${row.version}#${row.chunk_id}`,
        },
      });
      if (out.length === topK) break;
    }
    return out;
  }
}
