import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./browser",
  workers: 1,
  timeout: 45000,
  use: {
    baseURL: "http://127.0.0.1:8787",
    headless: true,
    viewport: { width: 1440, height: 1100 },
    ...(process.platform === "win32" ? { channel: "msedge" } : {}),
  },
  webServer: {
    command: "npm run dev",
    env: {
      VITE_AUTH0_DOMAIN: "fixture.us.auth0.com",
      VITE_AUTH0_CLIENT_ID: "synthetic-browser-client",
      VITE_AUTH0_AUDIENCE: "https://deskpilot-api",
    },
    url: "http://127.0.0.1:8787",
    reuseExistingServer: false,
    timeout: 120000,
  },
  outputDir: ".test-build/browser",
});
