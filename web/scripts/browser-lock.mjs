import { mkdir, open, readFile, rename, unlink } from "node:fs/promises";
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
    let contents;
    try {
      contents = await readFile(path, "utf8");
      owner = JSON.parse(contents);
    } catch {
      throw new Error("Browser test lock exists but cannot be validated");
    }
    if (
      Number.isSafeInteger(owner.pid) &&
      owner.pid > 0 &&
      processExists(owner.pid)
    )
      throw new Error("Another browser test server is already running");
    const stalePath = `${path}.stale-${token}`;
    try {
      await rename(path, stalePath);
    } catch (renameError) {
      if (renameError?.code === "ENOENT") return acquireBrowserLock(path);
      throw new Error("Browser test lock changed during stale recovery");
    }
    let recovered = false;
    try {
      const moved = await readFile(stalePath, "utf8");
      if (moved !== contents)
        throw new Error("Browser test lock changed during stale recovery");
      const movedOwner = JSON.parse(moved);
      if (
        Number.isSafeInteger(movedOwner.pid) &&
        movedOwner.pid > 0 &&
        processExists(movedOwner.pid)
      ) {
        await rename(stalePath, path).catch(() => {});
        throw new Error("Another browser test server is already running");
      }
      try {
        const handle = await open(path, "wx");
        await handle.writeFile(
          JSON.stringify({ pid: process.pid, token }) + "\n",
        );
        await handle.close();
        recovered = true;
      } catch (createError) {
        if (createError?.code === "EEXIST")
          throw new Error("Another browser test server is already running");
        throw createError;
      }
    } finally {
      if (!recovered)
        await unlink(stalePath).catch((cleanupError) => {
          if (cleanupError?.code !== "ENOENT") throw cleanupError;
        });
    }
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
