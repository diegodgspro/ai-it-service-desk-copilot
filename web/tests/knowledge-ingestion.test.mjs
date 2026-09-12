import assert from "node:assert/strict";
import test from "node:test";
import { parseArticle } from "../scripts/knowledge-lib.mjs";
import { renderArtifacts } from "../scripts/ingest-knowledge.mjs";

const article = `---
id: kb-test-line-endings
title: Test line endings
source_type: runbook
service: Test
category: Test
product: Test
operating_system: any
language: en
approval_status: approved
version: 1.0
last_reviewed: 2026-09-11
tags: test, portability
classification: synthetic-demo
---
# Test line endings

Introductory text.

## Steps
1. First step.
2. Second step.
`;

const parse = (raw) => parseArticle(raw, "knowledge_base/test-line-endings.md");

test("LF, CRLF, standalone CR and an optional UTF-8 BOM ingest identically", () => {
  const lf = parse(article);
  for (const variant of [
    article.replaceAll("\n", "\r\n"),
    article.replaceAll("\n", "\r"),
    `\uFEFF${article}`,
    `\uFEFF${article.replaceAll("\n", "\r\n")}`,
  ]) {
    const actual = parse(variant);
    assert.deepEqual(actual, lf);
    assert.equal(actual.document.contentHash, lf.document.contentHash);
    assert.equal(actual.document.documentId, lf.document.documentId);
    assert.deepEqual(actual.chunks, lf.chunks);
    assert.deepEqual(
      actual.chunks.map(({ chunkId }) => chunkId),
      lf.chunks.map(({ chunkId }) => chunkId),
    );
  }
});

test("repeated ingestion renders byte-stable JSON and SQL", () => {
  const first = renderArtifacts([parse(article)]);
  const second = renderArtifacts([parse(article.replaceAll("\n", "\r\n"))]);
  assert.equal(second.json, first.json);
  assert.equal(second.sql, first.sql);
  assert.deepEqual(second.documents, first.documents);
  assert.deepEqual(second.chunks, first.chunks);
});
