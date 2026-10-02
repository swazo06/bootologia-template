import { config as loadEnv } from "dotenv";
import { defineConfig, devices } from "@playwright/test";

loadEnv();

const cronSecret = process.env.CRON_SECRET ?? "e2e-cron-secret";

export default defineConfig({
  testDir: "tests/e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:3000",
    trace: "on-first-retry",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: {
    command: "npm run dev",
    url: "http://127.0.0.1:3000",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    env: {
      ...process.env,
      AUTH_BYPASS: "true",
      AUTH_BYPASS_ROLE: "ADMIN",
      CRON_SECRET: cronSecret,
      ENCRYPTION_KEY: "12345678901234567890123456789012",
      DRY_RUN: "true",
      ENABLE_META_PUBLISHING: "false",
      BRANDS_IN_MEMORY: "true",
      TEMPLATES_IN_MEMORY: "true",
      CONTENT_DRAFTS_IN_MEMORY: "true",
      PUBLICATIONS_IN_MEMORY: "true",
      SOCIAL_ACCOUNTS_IN_MEMORY: "true",
      API_RATE_LIMIT: "1000",
    },
  },
});
