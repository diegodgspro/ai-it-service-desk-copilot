import { rm } from "node:fs/promises";

// Browser tests must never inherit a previous build or local D1 state.
await Promise.all(
  [
    ".test-build/browser-dist",
    ".test-build/browser-state",
    ".test-build/browser-results",
  ].map((path) =>
    rm(path, { recursive: true, force: true }),
  ),
);
