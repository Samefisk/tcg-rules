import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests",
  use: {
    baseURL: "http://127.0.0.1:4174"
  },
  webServer: {
    command: "PORT=4174 node scripts/preview-site.mjs",
    url: "http://127.0.0.1:4174",
    reuseExistingServer: true
  }
});
