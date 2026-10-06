import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

test("home page shows the title, Spanish locale and passes axe", async ({
  page,
}) => {
  await page.goto("/");

  await expect(
    page.getByRole("heading", { level: 1, name: "Pesca Artesanal Galápagos" }),
  ).toBeVisible();
  await expect(page.locator("html")).toHaveAttribute("lang", "es");

  const results = await new AxeBuilder({ page }).analyze();
  const blocking = results.violations.filter(
    (violation) => violation.impact === "serious" || violation.impact === "critical",
  );
  // Print full details so a failure is actionable without re-running axe.
  if (blocking.length > 0) {
    console.log(JSON.stringify(blocking, null, 2));
  }
  expect(blocking).toEqual([]);
});
