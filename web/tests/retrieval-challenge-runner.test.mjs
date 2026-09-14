import assert from "node:assert/strict";
import test from "node:test";
import { matchesAllFilters, serialize, supportedRetrieverFilters } from "../scripts/run-retrieval-challenge-v1.mjs";

test("generic adapter enforces extended exact metadata without forwarding unsupported fields", () => {
  const filters = { service: "Endpoint", operatingSystem: "Windows", sourceType: "runbook", approvalStatus: "approved" };
  assert.deepEqual(supportedRetrieverFilters(filters), { service: "Endpoint", approvalStatus: "approved" });
  const result = { metadata: { service: "endpoint", operatingSystem: "windows", sourceType: "runbook", approvalStatus: "approved" } };
  assert.equal(matchesAllFilters(result, filters), true);
  assert.equal(matchesAllFilters(result, { ...filters, operatingSystem: "Linux" }), false);
});

test("sanitized serializer sorts keys, rounds numbers, and emits no timestamp", () => {
  assert.equal(serialize({ z: 1 / 3, a: { y: 2, x: 1 } }), '{\n  "a": {\n    "x": 1,\n    "y": 2\n  },\n  "z": 0.333333333\n}\n');
});
