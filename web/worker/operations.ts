export class InvalidOperation extends Error {}
const SPECS = {
  tickets: ["id ASC", "id", null],
  audit: ["id ASC", "id", "created_at"],
  analysis_history: ["id ASC", "id", "created_at"],
  knowledge_documents: ["document_id ASC", "document_id", "ingested_at"],
  knowledge_chunks: ["chunk_pk ASC", "chunk_pk", null],
  knowledge_retrieval_events: [
    "created_at ASC, retrieval_id ASC",
    "retrieval_id",
    "created_at",
  ],
  knowledge_retrieval_items: [
    "retrieval_id ASC, chunk_id ASC",
    "retrieval_id || char(31) || chunk_id",
    null,
  ],
  knowledge_feedback: [
    "created_at ASC, feedback_id ASC",
    "feedback_id",
    "created_at",
  ],
} as const;
const iso = (x: unknown) =>
  typeof x === "string" &&
  /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d+)?Z$/.test(x) &&
  Number.isFinite(Date.parse(x));
const hex = (x: ArrayBuffer) =>
  [...new Uint8Array(x)].map((v) => v.toString(16).padStart(2, "0")).join("");
export const sha256 = async (x: string) =>
  hex(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(x)));
export async function createExport(db: D1Database, value: unknown) {
  if (!value || Array.isArray(value) || typeof value !== "object")
    throw new InvalidOperation();
  const b = value as Record<string, unknown>;
  if (
    !Object.keys(b).every((k) =>
      ["dataset", "format", "limit", "after", "from", "to"].includes(k),
    ) ||
    b.format !== "deskpilot-export+json;version=1" ||
    typeof b.dataset !== "string" ||
    !(b.dataset in SPECS)
  )
    throw new InvalidOperation();
  const limit = b.limit === undefined ? 100 : b.limit;
  if (
    !Number.isInteger(limit) ||
    (limit as number) < 1 ||
    (limit as number) > 250
  )
    throw new InvalidOperation();
  const [order, cursor, time] = SPECS[b.dataset as keyof typeof SPECS];
  if (
    (b.after !== undefined && !["string", "number"].includes(typeof b.after)) ||
    ((b.from !== undefined || b.to !== undefined) && !time) ||
    (b.from !== undefined && !iso(b.from)) ||
    (b.to !== undefined && !iso(b.to))
  )
    throw new InvalidOperation();
  if (
    b.from &&
    b.to &&
    (Date.parse(b.to as string) < Date.parse(b.from as string) ||
      Date.parse(b.to as string) - Date.parse(b.from as string) > 2678400000)
  )
    throw new InvalidOperation();
  const where: string[] = [],
    args: unknown[] = [];
  if (b.after !== undefined) {
    where.push(`${cursor}>?`);
    args.push(b.after);
  }
  if (b.from) {
    where.push(`${time}>=?`);
    args.push(b.from);
  }
  if (b.to) {
    where.push(`${time}<=?`);
    args.push(b.to);
  }
  const rows = (
    await db
      .prepare(
        `SELECT * FROM ${b.dataset}${where.length ? ` WHERE ${where.join(" AND ")}` : ""} ORDER BY ${order} LIMIT ?`,
      )
      .bind(...args, (limit as number) + 1)
      .all<Record<string, unknown>>()
  ).results;
  const records = rows.slice(0, limit as number),
    last = records.at(-1),
    payload = {
      format: "deskpilot-export+json",
      version: 1,
      classification: "private-operational",
      dataset: b.dataset,
      ordering: order,
      recordCount: records.length,
      datasetCount: 1,
      nextAfter:
        rows.length > records.length && last
          ? cursor.includes("char(31)")
            ? `${last.retrieval_id}\u001f${last.chunk_id}`
            : last[cursor]
          : null,
      records,
    };
  const canonical = JSON.stringify(payload);
  if (new TextEncoder().encode(canonical).byteLength > 1048576)
    throw new InvalidOperation();
  return { payload, canonical, artifactSha256: await sha256(canonical) };
}
export async function capacity(db: D1Database) {
  const counts: Record<string, number> = {};
  for (const table of Object.keys(SPECS))
    counts[table] =
      (
        await db
          .prepare(`SELECT COUNT(*) n FROM ${table}`)
          .first<{ n: number }>()
      )?.n ?? 0;
  return {
    observedAt: new Date().toISOString(),
    officialUsageAvailable: false,
    source: "application-observed-row-counts",
    counts,
    approximateRows: Object.values(counts).reduce((a, b) => a + b, 0),
    levels: {
      knowledgeChunks:
        counts.knowledge_chunks >= 10000
          ? "action"
          : counts.knowledge_chunks >= 5000
            ? "watch"
            : "informational",
      retrievalEvents:
        counts.knowledge_retrieval_events >= 100000
          ? "action"
          : counts.knowledge_retrieval_events >= 50000
            ? "watch"
            : "informational",
    },
  };
}
