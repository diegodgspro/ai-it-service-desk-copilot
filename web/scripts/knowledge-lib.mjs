import { createHash } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
const required = [
  "id",
  "title",
  "source_type",
  "service",
  "category",
  "product",
  "operating_system",
  "language",
  "approval_status",
  "version",
  "last_reviewed",
  "tags",
  "classification",
];
const hash = (value) => createHash("sha256").update(value).digest("hex");
const slug = (value) =>
  value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60);
export function parseArticle(raw, sourcePath) {
  const match = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]+)$/);
  if (!match)
    throw new Error(`${sourcePath}: YAML-style metadata block is required`);
  const metadata = Object.fromEntries(
    match[1].split(/\r?\n/).map((line) => {
      const i = line.indexOf(":");
      if (i < 1) throw new Error(`${sourcePath}: malformed metadata`);
      return [line.slice(0, i).trim(), line.slice(i + 1).trim()];
    }),
  );
  if (
    Object.keys(metadata).some((k) => !required.includes(k)) ||
    required.some((k) => !metadata[k])
  )
    throw new Error(
      `${sourcePath}: metadata fields are missing or unsupported`,
    );
  if (
    !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(metadata.id) ||
    !["runbook", "policy"].includes(metadata.source_type) ||
    !["draft", "approved", "retired"].includes(metadata.approval_status) ||
    metadata.classification !== "synthetic-demo" ||
    !/^[a-z]{2}(?:-[A-Z]{2})?$/.test(metadata.language) ||
    !/^\d+\.\d+$/.test(metadata.version) ||
    !/^\d{4}-\d{2}-\d{2}$/.test(metadata.last_reviewed)
  )
    throw new Error(`${sourcePath}: invalid metadata value`);
  const content = match[2].trim(),
    sections = [];
  let heading = metadata.title,
    lines = [];
  for (const line of content.split(/\r?\n/)) {
    const h = line.match(/^#{1,3}\s+(.+)$/);
    if (h) {
      if (lines.join("\n").trim())
        sections.push({ heading, content: lines.join("\n").trim() });
      heading = h[1].trim();
      lines = [];
    } else lines.push(line);
  }
  if (lines.join("\n").trim())
    sections.push({ heading, content: lines.join("\n").trim() });
  const chunks = sections.map((s, ordinal) => ({
    chunkId: `${metadata.id}--${String(ordinal).padStart(2, "0")}-${slug(s.heading)}`,
    documentId: metadata.id,
    ordinal,
    ...s,
    contentHash: hash(s.heading + "\n" + s.content),
  }));
  return {
    document: {
      documentId: metadata.id,
      title: metadata.title,
      sourceType: metadata.source_type,
      service: metadata.service,
      category: metadata.category,
      product: metadata.product,
      operatingSystem:
        metadata.operating_system === "any"
          ? undefined
          : metadata.operating_system,
      language: metadata.language,
      approvalStatus: metadata.approval_status,
      version: metadata.version,
      lastReviewed: metadata.last_reviewed,
      tags: metadata.tags.split(",").map((x) => x.trim()),
      classification: metadata.classification,
      sourcePath,
      content,
      contentHash: hash(content),
    },
    chunks,
  };
}
export async function loadReviewedArticles(rootUrl) {
  const names = (await readdir(rootUrl))
    .filter((n) => /^[a-z0-9-]+\.md$/.test(n))
    .sort();
  if (!names.length) throw new Error("No allowlisted Markdown articles found");
  return Promise.all(
    names.map(async (n) =>
      parseArticle(
        await readFile(new URL(n, rootUrl), "utf8"),
        `knowledge_base/${n}`,
      ),
    ),
  );
}
export const sqlQuote = (value) =>
  value == null ? "NULL" : "'" + String(value).replaceAll("'", "''") + "'";
