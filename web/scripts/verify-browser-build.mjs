import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";

const root = ".test-build/browser-dist";
const expected = {
  domain: "auth.fixture.invalid",
  client: "synthetic-browser-client",
  audience: "https://deskpilot-api",
};

async function collect(path) {
  const entries = await readdir(path, { withFileTypes: true });
  const content = [];
  for (const entry of entries) {
    const child = join(path, entry.name);
    if (entry.isDirectory()) content.push(...(await collect(child)));
    else if (/\.(?:html|js)$/.test(entry.name))
      content.push(await readFile(child, "utf8"));
  }
  return content;
}

const output = (await collect(root)).join("\n");
const missing = Object.entries(expected)
  .filter(([, marker]) => !output.includes(marker))
  .map(([name]) => name);
if (missing.length)
  throw new Error(`Synthetic browser build markers missing: ${missing.join(", ")}`);
console.log("Synthetic browser build markers verified.");
