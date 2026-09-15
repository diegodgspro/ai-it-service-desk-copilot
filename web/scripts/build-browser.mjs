// Browser automation owns its synthetic public configuration. Developer and
// production env files are excluded by vite.browser.config.ts.
process.env.VITE_AUTH0_DOMAIN = "auth.fixture.invalid";
process.env.VITE_AUTH0_CLIENT_ID = "synthetic-browser-client";
process.env.VITE_AUTH0_AUDIENCE = "https://deskpilot-api";

const { build } = await import("vite");
await build({
  configFile: "vite.browser.config.ts",
  mode: "browser",
  build: { outDir: ".test-build/browser-dist" },
});
