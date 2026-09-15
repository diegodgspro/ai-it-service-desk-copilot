import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { spawn } from "node:child_process";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { acquireBrowserLock } from "../scripts/browser-lock.mjs";

const fixture = fileURLToPath(
  new URL("fixtures/browser-lock-process.mjs", import.meta.url),
);

function runFixture(mode, path, canary = "") {
  const child = spawn(process.execPath, [fixture, mode, path, canary], {
    stdio: ["ignore", "pipe", "pipe", "ipc"],
  });
  let stderr = "";
  child.stderr.on("data", (chunk) => (stderr += chunk));
  return {
    child,
    stderr: () => stderr,
    exit: new Promise((resolve) =>
      child.on("exit", (code, signal) => resolve({ code, signal })),
    ),
  };
}

const digest = async (path) =>
  createHash("sha256")
    .update(await readFile(path))
    .digest("hex");

test("browser lock rejects a second process before artifacts change", async () => {
  const root = await mkdtemp(join(tmpdir(), "deskpilot-browser-lock-"));
  const path = join(root, "browser.lock");
  const artifacts = join(root, "artifacts");
  const canary = join(artifacts, "canary.txt");
  try {
    await mkdir(artifacts);
    await writeFile(canary, "must remain unchanged\n");
    const before = await digest(canary);

    const holder = runFixture("hold", path);
    await new Promise((resolve, reject) => {
      holder.child.once("message", resolve);
      holder.child.once("exit", () => reject(new Error(holder.stderr())));
    });

    const contender = runFixture("touch", path, canary);
    assert.deepEqual(await contender.exit, { code: 2, signal: null });
    assert.match(
      contender.stderr(),
      /Another browser test server is already running/,
    );
    assert.equal(await digest(canary), before);

    holder.child.send("release");
    assert.deepEqual(await holder.exit, { code: 0, signal: null });
    const next = runFixture("touch", path, canary);
    assert.deepEqual(await next.exit, { code: 0, signal: null });
    assert.notEqual(await digest(canary), before);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("browser lock detects a stale PID without deleting it", async () => {
  const root = await mkdtemp(join(tmpdir(), "deskpilot-browser-lock-stale-"));
  const path = join(root, "browser.lock");
  const stale = JSON.stringify({ pid: 2_147_483_647, token: "stale" });
  try {
    await writeFile(path, stale);
    await assert.rejects(acquireBrowserLock(path), /remove the lock manually/);
    assert.equal(await readFile(path, "utf8"), stale);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
