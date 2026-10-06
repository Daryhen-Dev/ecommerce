// Shared axe helper: one definition of the storefront's accessibility bar
// (zero serious/critical violations) for every page and state.
import AxeBuilder from "@axe-core/playwright";
import { expect, type Page } from "@playwright/test";

/**
 * Runs axe on the CURRENT page state (URL, viewport, DOM mutations all
 * matter) and requires zero serious/critical violations. Blocking violations
 * are printed so a failure is actionable without re-running axe.
 */
export async function expectNoSeriousAxeViolations(page: Page): Promise<void> {
  const results = await new AxeBuilder({ page }).analyze();
  const blocking = results.violations.filter(
    (violation) =>
      violation.impact === "serious" || violation.impact === "critical",
  );
  if (blocking.length > 0) {
    console.log(JSON.stringify(blocking, null, 2));
  }
  expect(blocking).toEqual([]);
}
