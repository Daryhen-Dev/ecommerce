import { defineConfig, devices } from "@playwright/test";

import { ADMIN_E2E_ENV } from "./e2e/support/admin";

// E2E tests run against a production build of the app with a local,
// demo-seeded database. Port 3100 avoids clashing with a running `pnpm dev`
// on 3000. Chromium only: the product targets one browser engine for now.
export default defineConfig({
  testDir: "e2e",
  fullyParallel: false, // tests share one dev database
  retries: process.env.CI ? 2 : 0,
  reporter: "list",
  use: {
    baseURL: "http://localhost:3100",
    locale: "es-EC",
    timezoneId: "America/Guayaquil",
    trace: "retain-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: {
    command: "pnpm build && pnpm start --port 3100",
    url: "http://localhost:3100",
    reuseExistingServer: !process.env.CI,
    // The admin specs log in through the real form, so the server must sign
    // and verify sessions with the same values the tests use. Explicit env
    // wins over the developer's `.env`, so the suite is reproducible.
    env: ADMIN_E2E_ENV,
    timeout: 180_000,
  },
});
