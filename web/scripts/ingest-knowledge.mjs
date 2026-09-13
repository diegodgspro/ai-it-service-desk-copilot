import { mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { loadReviewedArticles, sqlQuote as q } from "./knowledge-lib.mjs";
export function renderArtifacts(records) {
  const documents = records.map((x) => x.document);
  const chunks = records.flatMap((x) => x.chunks);
  const lines = [
    "-- Generated deterministic reviewed synthetic knowledge seed. No network calls.",
    "PRAGMA foreign_keys=ON;",
  ];
  for (const d of documents) {
    lines.push(
      `INSERT INTO knowledge_documents(document_id,title,source_type,service,category,product,operating_system,language,approval_status,version,last_reviewed,tags_json,classification,source_path,content_hash) VALUES(${[d.documentId, d.title, d.sourceType, d.service, d.category, d.product, d.operatingSystem, d.language, d.approvalStatus, d.version, d.lastReviewed, JSON.stringify(d.tags), d.classification, d.sourcePath, d.contentHash].map(q).join(",")}) ON CONFLICT(document_id) DO UPDATE SET title=excluded.title,source_type=excluded.source_type,service=excluded.service,category=excluded.category,product=excluded.product,operating_system=excluded.operating_system,language=excluded.language,approval_status=excluded.approval_status,version=excluded.version,last_reviewed=excluded.last_reviewed,tags_json=excluded.tags_json,classification=excluded.classification,source_path=excluded.source_path,content_hash=excluded.content_hash;`,
      `DELETE FROM knowledge_chunks WHERE document_id=${q(d.documentId)};`,
    );
    for (const c of chunks.filter((x) => x.documentId === d.documentId))
      lines.push(
        `INSERT INTO knowledge_chunks(chunk_id,document_id,ordinal,heading,content,content_hash) VALUES(${[c.chunkId, c.documentId, c.ordinal, c.heading, c.content, c.contentHash].map(q).join(",")});`,
      );
  }
  return {
    documents,
    chunks,
    json: JSON.stringify({ documents, chunks }, null, 2) + "\n",
    sql: lines.join("\n") + "\n",
  };
}

export async function generateKnowledgeArtifacts() {
  const records = await loadReviewedArticles(
    new URL("../../knowledge_base/", import.meta.url),
  );
  const artifacts = renderArtifacts(records);
  await mkdir(new URL("../shared/", import.meta.url), { recursive: true });
  await writeFile(
    new URL("../shared/knowledge.json", import.meta.url),
    artifacts.json,
  );
  await writeFile(
    new URL("../knowledge-seed.sql", import.meta.url),
    artifacts.sql,
  );
  return artifacts;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const { documents, chunks } = await generateKnowledgeArtifacts();
  console.log(
    `Prepared ${documents.length} approved synthetic documents and ${chunks.length} stable chunks.`,
  );
}
