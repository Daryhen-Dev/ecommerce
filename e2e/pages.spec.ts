// Remaining storefront axe coverage and responsive smoke for S5.
//
// axe serious/critical = 0 is already asserted for /, /uio, 404 (catalog /
// home specs), the add-to-cart page with forms (cart.spec) and the cart with
// one line (cart.spec). This file covers the remaining pages/states:
// /gye, /cue, the empty cart, and re-checks the catalog for the other cities.
//
// Requires the local database migrated and demo-seeded with fresh relative
// dates BEFORE running:
//   pnpm db:seed && pnpm db:seed:demo
import { test, expect } from "@playwright/test";

import { SPECIES } from "./support/demo";
import { openCartWithItems } from "./support/cart";
import { expectNoSeriousAxeViolations } from "./support/axe";

test.describe("axe coverage for the remaining pages/states", () => {
  test("/gye passes axe", async ({ page }) => {
    await page.goto("/gye");
    await expectNoSeriousAxeViolations(page);
  });

  test("/cue passes axe", async ({ page }) => {
    await page.goto("/cue");
    await expectNoSeriousAxeViolations(page);
  });

  test("empty /uio/carrito passes axe", async ({ page }) => {
    await page.goto("/uio/carrito");
    await expect(page.getByText("Tu carrito está vacío")).toBeVisible();
    await expectNoSeriousAxeViolations(page);
  });
});

test.describe("responsive smoke (375x812)", () => {
  async function expectNoHorizontalScroll(
    page: import("@playwright/test").Page,
  ): Promise<void> {
    const { scrollWidth, innerWidth } = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      innerWidth: window.innerWidth,
    }));
    expect(
      scrollWidth,
      `page must not scroll horizontally at 375px (scrollWidth ${scrollWidth} > ${innerWidth})`,
    ).toBeLessThanOrEqual(innerWidth);
  }

  test("/uio fits a 375x812 viewport", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto("/uio");
    await expect(page.getByRole("heading", { level: 1 })).toContainText("Quito");
    await expectNoHorizontalScroll(page);
  });

  test("/uio/carrito with a line fits a 375x812 viewport", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await openCartWithItems(page, [{ name: SPECIES.snapper.name, kg: "7.5" }]);
    await expectNoHorizontalScroll(page);
  });
});
