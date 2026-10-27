import { defineConfig, devices } from "@playwright/test";

import { ADMIN_E2E_ENV } from "./e2e/support/admin";

// E2E tests run against a production build of the app with a local,
// demo-seeded database. Port 3100 avoids clashing with a running `pnpm dev`
// on 3000. Chromium only: the product targets one browser engine for now.
export default defineConfig({
  testDir: "e2e",
  fullyParallel: false, // tests share one dev database
  // One file at a time, for the same reason: the admin specs now MUTATE demo
  // data on purpose (A5 changes Pargo's price and tier set to prove the
  // storefront reflects it, A6 re-seeds the demo rows before each test), while
  // the storefront specs read those same rows concurrently. Running files in
  // parallel made those two correct behaviours fail each other — a re-seed
  // deleted a flight a shipments test was closing, and a cart read a tier set
  // mid-edit. Serial execution costs about a minute and buys determinism.
  workers: 1,
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
