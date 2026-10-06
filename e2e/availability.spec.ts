// Availability and defensive-cart E2E for S5: an out-of-season species is
// not addable, and a tampered localStorage cart (mahi-mahi line, unknown
// slug) is rejected by the server quote with the line error and no totals.
//
// SOLD_OUT is intentionally not covered: the demo seed has no orderable
// species reduced to zero available kg (the only fully-reserved lot belongs
// to grouper, which still has a 60 kg open lot).
//
// Requires the local database migrated and demo-seeded with fresh relative
// dates BEFORE running:
//   pnpm db:seed && pnpm db:seed:demo
import { test, expect } from "@playwright/test";

import { SPECIES } from "./support/demo";
import {
  addToCart,
  articleOf,
  currentCartStorageKey,
  tamperCartWith,
} from "./support/cart";
import { expectNoSeriousAxeViolations } from "./support/axe";

const MAHI = SPECIES.mahiMahi;
const SNAPPER = SPECIES.snapper;

test.describe("out-of-season species (/uio)", () => {
  test("Dorado card offers no quantity input and no add-to-cart button", async ({
    page,
  }) => {
    await page.goto("/uio");

    const mahiCard = articleOf(page, MAHI.name);
    await expect(mahiCard).toBeVisible();
    // The form only renders for AVAILABLE species: out of season is not
    // addable at all (its badge text is already covered in catalog.spec).
    await expect(mahiCard.getByLabel("Cantidad (kg)")).toHaveCount(0);
    await expect(
      mahiCard.getByRole("button", { name: "Agregar al carrito" }),
    ).toHaveCount(0);
  });
});

test.describe("tampered localStorage cart (/uio/carrito)", () => {
  // The shipment id is learned from the real cart key the UI writes, never
  // guessed: one real add stages cart:v1:<currentShipmentId>.
  async function stageCartKey(page: import("@playwright/test").Page): Promise<string> {
    await page.goto("/uio");
    await addToCart(page, SNAPPER.name, "1");
    return currentCartStorageKey(page);
  }

  test("an out-of-season line shows the error and hides the totals", async ({
    page,
  }) => {
    const key = await stageCartKey(page);
    await tamperCartWith(page, key, { slug: MAHI.slug, grams: 5000 });
    await page.goto("/uio/carrito");

    const row = page.getByRole("row").filter({ hasText: MAHI.name });
    await expect(row).toBeVisible();
    await expect(row).toContainText(
      "Está fuera de temporada. Quítalo de tu carrito.",
    );
    await expect(page.getByRole("region", { name: "Totales" })).toHaveCount(0);
    await expect(
      page.getByText("Hay líneas que no se pueden pedir: quítalas o ajústalas para continuar."),
    ).toBeVisible();

    // The line-error state must stay accessible too.
    await expectNoSeriousAxeViolations(page);
  });

  test("an unknown species line shows the error and hides the totals", async ({
    page,
  }) => {
    const key = await stageCartKey(page);
    await tamperCartWith(page, key, { slug: "calamar-fantasma", grams: 2000 });
    await page.goto("/uio/carrito");

    const row = page.getByRole("row").filter({ hasText: "calamar-fantasma" });
    await expect(row).toBeVisible();
    await expect(row).toContainText(
      "Este producto ya no existe en el catálogo. Quítalo de tu carrito.",
    );
    await expect(page.getByRole("region", { name: "Totales" })).toHaveCount(0);
  });
});
