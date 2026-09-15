import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { parseEnv } from "node:util";

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

const privateValues = [];
for (const path of [".env.local", ".dev.vars"]) {
  try {
    const values = parseEnv((await readFile(path, "utf8")).replace(/^\uFEFF/, ""));
    for (const [key, value] of Object.entries(values))
      if (
        /^(?:VITE_AUTH0_|AUTH0_(?:ISSUER|PERMISSIONS))/.test(key) &&
        value &&
        !Object.values(expected).includes(value)
      )
        privateValues.push(value);
  } catch (error) {
    if (error?.code !== "ENOENT")
      throw new Error("Private configuration safety check failed");
  }
}
if (privateValues.some((value) => output.includes(value)))
  throw new Error("Private configuration detected in browser build");
console.log("Synthetic browser build markers verified.");
