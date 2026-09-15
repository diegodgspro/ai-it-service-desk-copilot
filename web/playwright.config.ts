import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./browser",
  workers: 1,
  timeout: 45000,
  use: {
    baseURL: "http://127.0.0.1:8787",
    headless: true,
    serviceWorkers: "block",
    viewport: { width: 1440, height: 1100 },
    ...(process.platform === "win32" ? { channel: "msedge" } : {}),
  },
  webServer: {
    command: "node scripts/run-browser-server.mjs",
    env: {
      WRANGLER_SEND_METRICS: "false",
      VITE_AUTH0_DOMAIN: "auth.fixture.invalid",
      VITE_AUTH0_CLIENT_ID: "synthetic-browser-client",
      VITE_AUTH0_AUDIENCE: "https://deskpilot-api",
    },
    url: "http://127.0.0.1:8787",
    reuseExistingServer: false,
    gracefulShutdown: { signal: "SIGTERM", timeout: 5000 },
    timeout: 120000,
  },
  outputDir: ".test-build/browser-results",
});
