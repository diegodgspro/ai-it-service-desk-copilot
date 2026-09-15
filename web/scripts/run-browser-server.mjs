import { spawn } from "node:child_process";
import { acquireBrowserLock } from "./browser-lock.mjs";

if (!process.env.npm_execpath)
  throw new Error("Browser test server must be started through npm");
const release = await acquireBrowserLock(".test-build/browser-server.lock");
let released = false;
const releaseOnce = async () => {
  if (released) return;
  released = true;
  await release();
};

const child = spawn(
  process.execPath,
  [process.env.npm_execpath, "run", "test:browser:server:unlocked"],
  {
    stdio: "inherit",
    shell: false,
  },
);

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => {
    if (!child.killed) child.kill(signal);
  });
}

child.on("error", async (error) => {
  await releaseOnce();
  throw error;
});

child.on("exit", async (code, signal) => {
  await releaseOnce();
  process.exitCode = signal ? 1 : (code ?? 1);
});
