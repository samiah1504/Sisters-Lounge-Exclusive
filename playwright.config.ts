import { defineConfig, devices } from "@playwright/test";

/**
 * Public-page specs run against any dev server (no Supabase needed).
 * Authenticated specs require a configured Supabase project with the dev
 * seed loaded; they self-skip unless E2E_SUPABASE=1.
 */
export default defineConfig({
  testDir: "./e2e",
  timeout: 30_000,
  fullyParallel: true,
  retries: 0,
  use: {
    baseURL: process.env.E2E_BASE_URL ?? "http://localhost:3000",
    trace: "retain-on-failure",
  },
  projects: [
    {
      name: "mobile",
      use: {
        ...devices["Pixel 7"],
        // Environment-provided Chromium (no downloads in this sandbox).
        launchOptions: process.env.PW_CHROMIUM_PATH
          ? { executablePath: process.env.PW_CHROMIUM_PATH }
          : {},
      },
    },
  ],
  webServer: process.env.E2E_NO_SERVER
    ? undefined
    : {
        command: "npm run dev",
        url: "http://localhost:3000",
        reuseExistingServer: true,
        timeout: 120_000,
      },
});
