import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);
const challengeUrl = new URL("tests/retrieval-challenge-v1.json", root);
const knowledgeUrl = new URL("shared/knowledge.json", root);
const priorUrls = [
  new URL("tests/retrieval-golden.json", root),
  new URL("tests/retrieval-real-evaluation.json", root),
];

const expectedCounts = {
  paraphrase_synonym: 16,
  noisy_non_native: 12,
  terse_ticket: 12,
  ambiguous_multi_intent: 10,
  metadata_filter: 10,
  irrelevant_abstain: 10,
  adversarial_injection: 10,
};
const expectedSha256 = "9a2386414fe230945ae3d18d05773fec196c48ff4aa7550ebac9d2867b2a868d";
const datasetKeys = ["datasetVersion", "language", "status", "cases"];
const caseKeys = ["caseId", "query", "category", "expectedAbstention", "metadataFilters", "acceptableDocumentIds", "acceptableChunkIds", "relevance", "rationale", "difficulty", "tags"];
const filterKeys = [
  "service",
  "category",
  "product",
  "operatingSystem",
  "language",
  "sourceType",
  "approvalStatus",
];

const tokenize = (value) =>
  new Set(
    value
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, " ")
      .trim()
      .split(/\s+/)
      .filter(Boolean),
  );

const jaccard = (left, right) => {
  const intersection = [...left].filter((token) => right.has(token)).length;
  const union = new Set([...left, ...right]).size;
  return union === 0 ? 1 : intersection / union;
};

const collectQueries = (value, output = []) => {
  if (Array.isArray(value)) {
    value.forEach((item) => collectQueries(item, output));
  } else if (value && typeof value === "object") {
    for (const [key, item] of Object.entries(value)) {
      if ((key === "query" || key === "input") && typeof item === "string") output.push(item);
      else collectQueries(item, output);
    }
  }
  return output;
};

const load = async (url) => JSON.parse(await readFile(url, "utf8"));

test("challenge v1 has deterministic UTF-8/LF serialization and exact shape", async () => {
  const bytes = await readFile(challengeUrl);
  assert.equal(bytes.length, 57599);
  assert.equal(createHash("sha256").update(bytes).digest("hex"), expectedSha256);
  assert.equal(bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf, false, "UTF-8 BOM is forbidden");
  const text = bytes.toString("utf8");
  assert.equal(text.includes("\r"), false, "CR/CRLF is forbidden");
  const dataset = JSON.parse(text);
  assert.deepEqual(Object.keys(dataset), datasetKeys);
  assert.equal(text, `${JSON.stringify(dataset, null, 2)}\n`);
  assert.equal(dataset.datasetVersion, "1.0.0");
  assert.equal(dataset.language, "en");
  assert.equal(dataset.status, "frozen");
  assert.equal(dataset.cases.length, 80);
  assert.deepEqual(dataset.cases.map(({ caseId }) => caseId), Array.from({ length: 80 }, (_, index) => `irc-v1-${String(index + 1).padStart(3, "0")}`));
});

test("IDs, grades, references, filters, abstention, and coverage are valid", async () => {
  const dataset = await load(challengeUrl);
  const knowledge = await load(knowledgeUrl);
  const documents = new Map(knowledge.documents.map((document) => [document.documentId, document]));
  const chunks = new Map(knowledge.chunks.map((chunk) => [chunk.chunkId, chunk]));
  const ids = new Set();
  const coveredDocuments = new Set();
  const counts = Object.fromEntries(Object.keys(expectedCounts).map((category) => [category, 0]));

  for (const item of dataset.cases) {
    assert.deepEqual(Object.keys(item), caseKeys);
    assert.equal(ids.has(item.caseId), false, `duplicate ID ${item.caseId}`);
    ids.add(item.caseId);
    assert.ok(Object.hasOwn(expectedCounts, item.category), `invalid category ${item.category}`);
    counts[item.category] += 1;
    assert.equal(Object.keys(item.metadataFilters).length > 0, item.category === "metadata_filter", `${item.caseId}: filter/category mismatch`);
    assert.ok(["easy", "medium", "hard"].includes(item.difficulty));
    assert.equal(typeof item.query, "string");
    assert.equal(typeof item.rationale, "string");
    assert.equal(typeof item.expectedAbstention, "boolean");
    assert.ok(item.query.length >= 8 && item.query.length <= 500);
    assert.ok(item.rationale.length >= 12 && item.rationale.length <= 500);
    assert.ok(item.tags.length > 0 && item.tags.every((tag) => /^[a-z0-9][a-z0-9-]*$/.test(tag)));
    assert.equal(new Set(item.tags).size, item.tags.length);
    assert.equal(new Set(item.acceptableDocumentIds).size, item.acceptableDocumentIds.length);
    assert.equal(new Set(item.acceptableChunkIds).size, item.acceptableChunkIds.length);

    for (const documentId of item.acceptableDocumentIds) {
      assert.ok(documents.has(documentId), `${item.caseId}: invalid document ${documentId}`);
      coveredDocuments.add(documentId);
    }
    for (const chunkId of item.acceptableChunkIds) {
      assert.ok(chunks.has(chunkId), `${item.caseId}: invalid chunk ${chunkId}`);
      assert.ok(item.acceptableDocumentIds.includes(chunks.get(chunkId).documentId));
    }
    const judgmentIdentities = new Set();
    const judgedDocuments = new Set();
    const judgedChunks = new Set();
    for (const judgment of item.relevance) {
      assert.deepEqual(Object.keys(judgment), judgment.chunkId ? ["documentId", "chunkId", "grade"] : ["documentId", "grade"]);
      const identity = `${judgment.documentId}\u0000${judgment.chunkId ?? ""}`;
      assert.equal(judgmentIdentities.has(identity), false, `${item.caseId}: duplicate relevance identity`);
      judgmentIdentities.add(identity);
      assert.ok(Number.isInteger(judgment.grade) && judgment.grade >= 1 && judgment.grade <= 3);
      assert.ok(item.acceptableDocumentIds.includes(judgment.documentId));
      judgedDocuments.add(judgment.documentId);
      if (judgment.chunkId) {
        assert.ok(item.acceptableChunkIds.includes(judgment.chunkId));
        assert.equal(chunks.get(judgment.chunkId)?.documentId, judgment.documentId);
        judgedChunks.add(judgment.chunkId);
      }
    }
    assert.deepEqual([...judgedDocuments].sort(), [...item.acceptableDocumentIds].sort());
    assert.deepEqual([...judgedChunks].sort(), [...item.acceptableChunkIds].sort());
    const sufficient = item.relevance.some(({ grade }) => grade >= 2);
    if (item.expectedAbstention) {
      assert.deepEqual(item.acceptableDocumentIds, []);
      assert.deepEqual(item.acceptableChunkIds, []);
      assert.deepEqual(item.relevance, []);
    } else assert.equal(sufficient, true, `${item.caseId}: no grade 2/3 judgment`);

    for (const [key, value] of Object.entries(item.metadataFilters)) {
      assert.ok(filterKeys.includes(key), `${item.caseId}: unsupported filter ${key}`);
      assert.equal(typeof value, "string");
      assert.ok(value.length > 0);
      assert.ok(knowledge.documents.some((document) => document[key] === value), `${item.caseId}: invalid ${key} value`);
    }
    for (const documentId of item.acceptableDocumentIds) {
      const document = documents.get(documentId);
      for (const [key, value] of Object.entries(item.metadataFilters)) assert.equal(document[key], value);
    }
  }
  assert.deepEqual(counts, expectedCounts);
  assert.deepEqual([...coveredDocuments].sort(), [...documents.keys()].sort());
});

test("queries are neither duplicated nor near-duplicates of challenge or prior evaluations", async () => {
  const dataset = await load(challengeUrl);
  const priorQueries = [];
  for (const url of priorUrls) collectQueries(await load(url), priorQueries);
  const challenge = dataset.cases.map((item) => ({ id: item.caseId, query: item.query, tokens: tokenize(item.query) }));
  for (let left = 0; left < challenge.length; left += 1) {
    for (let right = left + 1; right < challenge.length; right += 1) {
      assert.ok(jaccard(challenge[left].tokens, challenge[right].tokens) < 0.8, `${challenge[left].id} near-duplicates ${challenge[right].id}`);
    }
    for (const prior of priorQueries) {
      assert.ok(jaccard(challenge[left].tokens, tokenize(prior)) < 0.8, `${challenge[left].id} near-duplicates a prior evaluation query`);
    }
  }
});

test("all adversarial safety families are explicitly represented", async () => {
  const dataset = await load(challengeUrl);
  const tags = new Set(dataset.cases.filter(({ category }) => category === "adversarial_injection").flatMap(({ tags: caseTags }) => caseTags));
  for (const required of ["approved-only-bypass", "authorization-change", "priority-change", "automation-approval", "citation-invention", "abstention-suppression", "secret-request", "configuration-request"]) assert.ok(tags.has(required), `missing adversarial coverage: ${required}`);
});
