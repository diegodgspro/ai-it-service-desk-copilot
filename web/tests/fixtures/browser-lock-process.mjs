import { acquireBrowserLock } from "../../scripts/browser-lock.mjs";
import { writeFile } from "node:fs/promises";

const [, , mode, path, canary] = process.argv;

try {
  const release = await acquireBrowserLock(path);
  if (mode === "touch") {
    await writeFile(canary, "changed only after lock acquisition\n");
    await release();
    process.exit(0);
  }
  if (mode !== "hold") throw new Error("Unknown browser lock fixture mode");
  process.send?.("ready");
  process.on("message", async (message) => {
    if (message !== "release") return;
    await release();
    process.exit(0);
  });
} catch (error) {
  process.stderr.write(error.message + "\n");
  process.exit(2);
}
