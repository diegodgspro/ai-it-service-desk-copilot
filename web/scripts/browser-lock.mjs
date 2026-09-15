import { mkdir, open, readFile, unlink } from "node:fs/promises";
import { dirname } from "node:path";
import { randomUUID } from "node:crypto";

function processExists(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error?.code === "EPERM";
  }
}

export async function acquireBrowserLock(path) {
  await mkdir(dirname(path), { recursive: true });
  const token = randomUUID();
  const contents = JSON.stringify({ pid: process.pid, token }) + "\n";
  try {
    const handle = await open(path, "wx");
    await handle.writeFile(contents);
    await handle.close();
  } catch (error) {
    if (error?.code !== "EEXIST") throw error;
    let owner;
    try {
      owner = JSON.parse(await readFile(path, "utf8"));
    } catch {
      throw new Error("Browser test lock exists but cannot be validated");
    }
    if (
      Number.isSafeInteger(owner.pid) &&
      owner.pid > 0 &&
      processExists(owner.pid)
    )
      throw new Error("Another browser test server is already running");
    throw new Error(
      "Stale browser test lock detected; verify no test server is running, then remove the lock manually",
    );
  }
  return async () => {
    try {
      const owner = JSON.parse(await readFile(path, "utf8"));
      if (owner.token === token) await unlink(path);
    } catch (error) {
      if (error?.code !== "ENOENT") throw error;
    }
  };
}
