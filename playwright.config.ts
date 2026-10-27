import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./tests/browser", fullyParallel: false, workers: 1, timeout: 120000,
  use: { baseURL:"http://127.0.0.1:3000", browserName:"chromium", channel:"msedge", viewport:{width:1440,height:1000}, trace:"retain-on-failure" },
  reporter: "list",
  webServer: {
    command: "node node_modules/next/dist/bin/next dev --webpack --hostname 127.0.0.1 --port 3000",
    url: "http://127.0.0.1:3000/vault",
    reuseExistingServer: !process.env.CI,
    timeout: 180000,
    env: { NEXT_TELEMETRY_DISABLED: "1" },
  },
});
