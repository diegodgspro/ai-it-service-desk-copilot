import { defineConfig } from "vite";

export default defineConfig({
  // Never load developer or production .env files for browser automation.
  envDir: "browser/fixtures/env",
});
