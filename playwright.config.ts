import { defineConfig, devices } from "@playwright/test";

const baseURL = process.env.PLAYWRIGHT_BASE_URL || "http://127.0.0.1:3003";
const apiURL = process.env.PLAYWRIGHT_API_URL || "http://127.0.0.1:3019";
const useExistingServer = process.env.PLAYWRIGHT_USE_EXISTING_SERVER === "1";

export default defineConfig({
  testDir: "./tests/playwright",
  timeout: 30_000,
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : [["list"], ["html", { open: "never" }]],
  use: {
    baseURL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
  webServer: useExistingServer
    ? undefined
    : [
        {
          command:
            '/bin/zsh -lc "set -a && source .env.local && set +a && PORT=3019 node apps/api/src/index.js"',
          url: `${apiURL}/v1/health`,
          reuseExistingServer: !process.env.CI,
          timeout: 120_000,
        },
        {
          command:
            '/bin/zsh -lc "set -a && source .env.local && set +a && FRONTEND_AUTH_MODE=disabled NEXT_PUBLIC_API_BASE_URL=http://127.0.0.1:3019/v1 NEXT_PUBLIC_APP_BASE_URL=http://127.0.0.1:3003 cd apps/frontend && ../../node_modules/.bin/next dev -p 3003"',
          url: `${baseURL}/admin/style-dna`,
          reuseExistingServer: !process.env.CI,
          timeout: 180_000,
        },
      ],
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
