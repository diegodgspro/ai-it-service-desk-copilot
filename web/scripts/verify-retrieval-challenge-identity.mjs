// Byte-only identity gate. Deliberately never decodes or parses challenge content.
import { createHash } from "node:crypto";
import { readFile, stat } from "node:fs/promises";
import { resolve } from "node:path";
import { CONTRACT, serialize } from "./run-retrieval-challenge-v1.mjs";

const challengePath = resolve(new URL("../tests/retrieval-challenge-v1.json", import.meta.url).pathname.replace(/^\/(.:)/, "$1"));
const bytes = await readFile(challengePath);
const digest = createHash("sha256").update(bytes).digest("hex");
if (digest !== CONTRACT.challengeSha256) throw new Error("challenge digest mismatch");
process.stdout.write(serialize({ version: CONTRACT.challengeVersion, byteSize: (await stat(challengePath)).size, sha256: digest, contentDecoded: false }));
