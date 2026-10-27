import { test, expect } from "@playwright/test";

import { expectNoSeriousAxeViolations } from "./support/axe";

test("home page shows the title, Spanish locale and passes axe", async ({
  page,
}) => {
  await page.goto("/");

  await expect(
    page.getByRole("heading", { level: 1, name: "Pesca Artesanal Galápagos" }),
  ).toBeVisible();
  await expect(page.locator("html")).toHaveAttribute("lang", "es");

  await expectNoSeriousAxeViolations(page);
});
