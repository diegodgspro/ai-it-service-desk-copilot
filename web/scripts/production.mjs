// Read ignored configuration without printing values or passing secrets in argv.
import { readFileSync } from "node:fs";
import { parseEnv } from "node:util";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

process.chdir(fileURLToPath(new URL("../", import.meta.url)));
const mode = process.argv[2];
if (!["build", "secrets", "deploy"].includes(mode)) {
  console.error("Usage: node scripts/production.mjs build|secrets|deploy");
  process.exit(1);
}
function requireValue(condition, message) {
  if (!condition) throw new Error(message);
}
function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    encoding: "utf8",
    stdio: ["pipe", "pipe", "pipe"],
    ...options,
  });
  // Wrangler can include binding values in diagnostics. Never echo its output.
  requireValue(result.status === 0, "Command failed; inspect privately before retrying.");
  return result.stdout;
}
try {
  const spa = parseEnv(readFileSync(".env.local", "utf8").replace(/^\uFEFF/, ""));
  const server = parseEnv(readFileSync(".dev.vars", "utf8").replace(/^\uFEFF/, ""));
  requireValue(
    /^[a-z0-9-]+(?:\.[a-z0-9-]+)?\.auth0\.com$/.test(spa.VITE_AUTH0_DOMAIN || "") &&
      !!spa.VITE_AUTH0_CLIENT_ID?.trim() &&
      spa.VITE_AUTH0_AUDIENCE === "https://deskpilot-api" &&
      server.AUTH0_AUDIENCE === spa.VITE_AUTH0_AUDIENCE &&
      server.AUTH0_ISSUER === `https://${spa.VITE_AUTH0_DOMAIN}/`,
    "Auth0 public settings and exact issuer must agree.",
  );
  requireValue(
    !Object.keys({ ...spa, ...server }).some((key) => /CLIENT_SECRET|VITE_.*PERMISSIONS/.test(key)),
    "Forbidden frontend secret setting.",
  );
  const grants = JSON.parse(server.AUTH0_PERMISSIONS);
  requireValue(
    grants && typeof grants === "object" && !Array.isArray(grants) &&
      Object.keys(grants).length > 0 &&
      Object.entries(grants).every(([subject, permissions]) =>
        subject.trim() && Array.isArray(permissions) &&
        permissions.every((permission) => ["read", "write"].includes(permission)) &&
        (!permissions.includes("write") || permissions.includes("read"))),
    "Server grants must be explicitly configured and valid.",
  );
  const config = JSON.parse(readFileSync("wrangler.json", "utf8"));
  requireValue(
    config.name === "deskpilot" && config.workers_dev === true &&
      config.preview_urls === false && config.vars.APP_ENV === "production" &&
      config.vars.LOCAL_DEV_IDENTITY === "disabled" &&
      config.vars.APP_ORIGIN === "https://deskpilot.diegodgspro.workers.dev" &&
      config.vars.AUTH0_AUDIENCE === "https://deskpilot-api" &&
      config.d1_databases.length === 1 &&
      config.d1_databases[0].binding === "DB" &&
      config.d1_databases[0].database_name === "deskpilot-production" &&
      config.d1_databases[0].database_id !== "00000000-0000-0000-0000-000000000000",
    "Production Worker configuration is not ready.",
  );
  const wrangler = ["node_modules/wrangler/bin/wrangler.js"];
  const env = { ...process.env, WRANGLER_SEND_METRICS: "false" };
  if (mode === "secrets") {
    run(process.execPath, [...wrangler, "secret", "bulk"], {
      env,
      input: JSON.stringify({
        AUTH0_ISSUER: server.AUTH0_ISSUER,
        AUTH0_PERMISSIONS: server.AUTH0_PERMISSIONS,
      }),
    });
    console.log("Production Auth0 server secrets stored through Wrangler.");
  } else {
    if (mode === "deploy") {
      requireValue(run("git", ["branch", "--show-current"]).trim() === "main", "Deploy only main.");
      requireValue(!run("git", ["status", "--porcelain"]).trim(), "Deploy only a clean tree.");
      requireValue(run("git", ["rev-parse", "HEAD"]) === run("git", ["rev-parse", "origin/main"]), "Update main before deployment.");
    }
    for (const key of ["VITE_AUTH0_DOMAIN", "VITE_AUTH0_CLIENT_ID", "VITE_AUTH0_AUDIENCE"])
      env[key] = spa[key];
    run(process.execPath, ["scripts/sync-data.mjs"], { env });
    run(process.execPath, ["node_modules/vite/bin/vite.js", "build"], { env });
    run("git", ["diff", "--exit-code", "--", "shared/data.json", "migrations/0002_synthetic_seed.sql"]);
    const output = run(process.execPath, [...wrangler, "deploy", ...(mode === "build"
      ? ["--dry-run", "--outdir", ".test-build"] : ["--no-autoconfig"])], { env });
    console.log(mode === "build" ? "Production SPA and Worker dry-run build passed." : "Merged main deployed.");
    if (mode === "deploy") {
      const version = output.match(/Current Version ID:\s*([a-f0-9-]+)/i);
      if (version) console.log("Worker version:", version[1]);
      console.log("Production URL: https://deskpilot.diegodgspro.workers.dev");
    }
  }
} catch {
  console.error("Production operation stopped. Configuration or command validation failed; values suppressed.");
  process.exitCode = 1;
}
