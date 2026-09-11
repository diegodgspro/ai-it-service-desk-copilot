import { test } from "node:test";
import assert from "node:assert/strict";
import golden from "./retrieval-golden.json" with { type: "json" };
test("golden dataset covers required domains and honest thresholds are declared", () => {
  assert.ok(golden.length >= 12);
  for (const term of [
    "Active Directory",
    "VPN",
    "Microsoft 365",
    "printer",
    "Windows 11",
    "ERP",
    "permissions",
    "software",
  ])
    assert.ok(golden.some((x) => x.query.includes(term)));
  assert.ok(golden.filter((x) => x.abstain).length >= 2);
});
