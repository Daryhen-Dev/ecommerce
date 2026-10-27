// Optional screenshot capture for review handoffs.
//
// The suite never writes files by default (Playwright's own artifacts are
// enough). When `E2E_SCREENSHOTS_DIR` points at a directory, the specs listed
// in the task capture full-page PNGs there instead of committing images into
// the repository:
//
//   E2E_SCREENSHOTS_DIR=/tmp/admin-shots pnpm test:e2e
//
// The directory must already exist; a failing write fails the test, so a
// broken capture path is never silently ignored.

import path from "node:path";

import type { Page } from "@playwright/test";

/**
 * Saves a full-page screenshot of the CURRENT page state when the run asked
 * for screenshots, and does nothing otherwise.
 */
export async function captureScreenshot(page: Page, name: string): Promise<void> {
  const directory = process.env.E2E_SCREENSHOTS_DIR;
  if (directory === undefined || directory.trim() === "") {
    return;
  }
  await page.screenshot({ path: path.join(directory, `${name}.png`), fullPage: true });
}
