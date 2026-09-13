import assert from "node:assert/strict";
import test from "node:test";
import dataset from "./retrieval-real-evaluation.json" with { type: "json" };

const DOCUMENT_IDS = new Set([
  "kb-access-shared-folder",
  "kb-active-directory-account-lockout",
  "kb-business-application-erp",
  "kb-endpoint-windows-performance",
  "kb-hardware-printing",
  "kb-microsoft365-outlook-authentication",
  "kb-network-dns-troubleshooting",
  "kb-network-vpn-troubleshooting",
  "kb-service-desk-escalation-policy",
  "kb-software-general-incidents",
]);
const SPLITS = new Set(["preserved", "development", "final"]);
const EXPANDED_CATEGORIES = new Set([
  "paraphrase",
  "synonym",
  "ambiguous",
  "irrelevant",
  "metadata-filter",
  "adversarial",
  "duplicate",
  "abstention",
]);
const FILTERS = new Set([
  "service",
  "category",
  "product",
  "language",
  "approvalStatus",
]);
const QUERY_INSTRUCTION =
  "represent this sentence for searching relevant passages:";

test("real evaluation dataset is versioned, separated, and leakage resistant", () => {
  assert.equal(dataset.schemaVersion, 1);
  assert.equal(typeof dataset.description, "string");
  assert.ok(dataset.description.trim().length > 0);
  assert.ok(Array.isArray(dataset.cases));
  assert.equal(dataset.cases.length, 40);

  const ids = new Set();
  const normalizedQueries = new Set();
  const splitCounts = { preserved: 0, development: 0, final: 0 };
  const expandedCoverage = new Map([
    ["development", new Set()],
    ["final", new Set()],
  ]);

  for (const evaluationCase of dataset.cases) {
    assert.equal(typeof evaluationCase.id, "string");
    assert.match(evaluationCase.id, /^[a-z0-9]+(?:-[a-z0-9]+)*$/);
    assert.ok(!ids.has(evaluationCase.id), `duplicate id: ${evaluationCase.id}`);
    ids.add(evaluationCase.id);

    assert.ok(SPLITS.has(evaluationCase.split), evaluationCase.id);
    splitCounts[evaluationCase.split]++;
    assert.equal(typeof evaluationCase.category, "string");
    if (expandedCoverage.has(evaluationCase.split))
      expandedCoverage.get(evaluationCase.split).add(evaluationCase.category);

    assert.equal(typeof evaluationCase.query, "string");
    const normalizedQuery = evaluationCase.query.normalize("NFKC").trim().toLowerCase();
    assert.ok(normalizedQuery.length > 0 && normalizedQuery.length <= 500);
    assert.ok(
      !normalizedQuery.startsWith(QUERY_INSTRUCTION),
      `query instruction must be applied by the adapter, not stored: ${evaluationCase.id}`,
    );
    assert.ok(
      !normalizedQueries.has(normalizedQuery),
      `query repeated across evaluation splits: ${evaluationCase.id}`,
    );
    normalizedQueries.add(normalizedQuery);

    assert.ok(Array.isArray(evaluationCase.expectedDocumentIds));
    assert.equal(
      new Set(evaluationCase.expectedDocumentIds).size,
      evaluationCase.expectedDocumentIds.length,
      `duplicate relevance label: ${evaluationCase.id}`,
    );
    for (const documentId of evaluationCase.expectedDocumentIds)
      assert.ok(DOCUMENT_IDS.has(documentId), `${evaluationCase.id}: ${documentId}`);
    assert.equal(typeof evaluationCase.shouldAbstain, "boolean");
    if (evaluationCase.shouldAbstain)
      assert.deepEqual(evaluationCase.expectedDocumentIds, [], evaluationCase.id);
    else
      assert.ok(evaluationCase.expectedDocumentIds.length > 0, evaluationCase.id);

    if (evaluationCase.filters !== undefined) {
      assert.equal(typeof evaluationCase.filters, "object");
      assert.ok(!Array.isArray(evaluationCase.filters));
      assert.ok(Object.keys(evaluationCase.filters).length > 0);
      for (const [key, value] of Object.entries(evaluationCase.filters)) {
        assert.ok(FILTERS.has(key), `${evaluationCase.id}: ${key}`);
        assert.equal(typeof value, "string");
        assert.ok(value.trim().length > 0 && value.length <= 120);
      }
    }
    if (evaluationCase.category === "metadata-filter")
      assert.ok(evaluationCase.filters, evaluationCase.id);
  }

  assert.deepEqual(splitCounts, { preserved: 12, development: 12, final: 16 });
  const combinedExpandedCoverage = new Set([
    ...expandedCoverage.get("development"),
    ...expandedCoverage.get("final"),
  ]);
  assert.deepEqual(combinedExpandedCoverage, EXPANDED_CATEGORIES);
  for (const category of EXPANDED_CATEGORIES) {
    assert.ok(
      expandedCoverage.get("final").has(category),
      `final split lacks held-out ${category} coverage`,
    );
  }
});

test("threshold selection cannot consume final evaluation cases", () => {
  const developmentIds = new Set(
    dataset.cases
      .filter((evaluationCase) => evaluationCase.split === "development")
      .map((evaluationCase) => evaluationCase.id),
  );
  const finalIds = dataset.cases
    .filter((evaluationCase) => evaluationCase.split === "final")
    .map((evaluationCase) => evaluationCase.id);
  assert.ok(developmentIds.size > 0);
  assert.ok(finalIds.length > 0);
  assert.ok(finalIds.every((id) => !developmentIds.has(id)));
});
