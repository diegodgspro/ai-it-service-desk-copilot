import { spawn } from "node:child_process";
import { dirname, join } from "node:path";
import { acquireBrowserLock } from "./browser-lock.mjs";

const npmCli = join(
  dirname(process.execPath),
  "node_modules/npm/bin/npm-cli.js",
);
const release = await acquireBrowserLock(".test-build/browser-server.lock");
let released = false;
const releaseOnce = async () => {
  if (released) return;
  released = true;
  await release();
};

const child = spawn(
  process.execPath,
  [npmCli, "run", "test:browser:server:unlocked"],
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
