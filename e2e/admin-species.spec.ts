// Species E2E (A5): the list, editing a price, editing the CUSTOM tier set, the
// server-side validation of the policy/tier coupling, the immutable slug, the
// season windows of a seasonal species, and axe on both panel pages.
//
// Requires the local database migrated and demo-seeded BEFORE running:
//   pnpm db:seed && pnpm db:seed:demo
//
// Every mutation is restored inside its own test (the price goes back to the
// value the form showed, the tier discount goes back to the demo value, the
// added season is removed), so a suite re-run starts from the same demo data.
// The one exception is the rejected submission, which by definition writes
// nothing, and the created species of the last test: the panel never deletes a
// species (orders reference them), so it stays as an `e2e-species-*` row that
// the seed-demo cleanup follow-up has to remove.

import { expect, test, type Page } from "@playwright/test";

import { loginAsAdmin } from "./support/admin";
import { expectNoSeriousAxeViolations } from "./support/axe";
import { articleOf } from "./support/cart";
import { SPECIES } from "./support/demo";
import { captureScreenshot } from "./support/screenshots";

const SNAPPER = SPECIES.snapper;
const LOBSTER = SPECIES.lobster;

/** Row of the species table identified by its name. */
function speciesRow(page: Page, name: string) {
  return page.getByRole("row").filter({ hasText: name });
}

/**
 * Saves the species edit form and waits for the success banner (the success
 * path redirects to `?saved=1`; a refused submission stays on the form).
 */
async function saveSpecies(page: Page): Promise<void> {
  await page.getByRole("button", { name: "Guardar cambios" }).click();
}

/** Saves and waits for the panel to confirm the write. */
async function saveSpeciesAndWaitForBanner(page: Page): Promise<void> {
  await saveSpecies(page);
  await expect(page.getByRole("status")).toContainText("Cambios guardados.");
}

test.beforeEach(async ({ page }) => {
  await loginAsAdmin(page);
});

test("the list shows every species with its configuration and passes axe", async ({
  page,
}) => {
  await page.goto("/admin/species");

  await expect(page.getByRole("heading", { level: 1, name: "Especies" })).toBeVisible();

  const snapperRow = speciesRow(page, SNAPPER.name);
  // CUSTOM policy and the demo price, read through the same formatters the
  // storefront uses.
  await expect(snapperRow).toContainText(SNAPPER.slug);
  await expect(snapperRow).toContainText("$12.00");
  await expect(snapperRow).toContainText("Tramos propios");
  await expect(snapperRow).toContainText("IVA estándar");
  await expect(snapperRow).toContainText("No");

  const lobsterRow = speciesRow(page, LOBSTER.name);
  await expect(lobsterRow).toContainText("Sin descuento");
  await expect(lobsterRow).toContainText("Sí");
  await expect(lobsterRow).toContainText("1 temporada");

  await captureScreenshot(page, "admin-species");
  await expectNoSeriousAxeViolations(page);
});

test("changing a price shows up on the storefront and the slug cannot be edited", async ({
  page,
}) => {
  await page.goto(`/admin/species/${SNAPPER.slug}`);

  await expect(page.getByRole("heading", { level: 1, name: SNAPPER.name })).toBeVisible();
  // The slug is shown, never offered as an input: the storefront and the cart
  // already use it.
  await expect(page.getByRole("textbox", { name: "Slug" })).toHaveCount(0);
  await expect(page.getByText(SNAPPER.slug, { exact: true })).toBeVisible();

  await captureScreenshot(page, "admin-species-edit");
  await expectNoSeriousAxeViolations(page);

  const priceInput = page.getByLabel("Precio por kilo (USD)");
  const originalPrice = await priceInput.inputValue();
  const editedPrice = "13.40";

  await priceInput.fill(editedPrice);
  await saveSpeciesAndWaitForBanner(page);

  // The storefront quotes the new price on the next visit.
  await page.goto("/uio");
  await expect(articleOf(page, SNAPPER.name)).toContainText("$13.40");

  // Restore the demo price so the suite is re-run safe, and prove the round
  // trip both ways.
  await page.goto(`/admin/species/${SNAPPER.slug}`);
  await page.getByLabel("Precio por kilo (USD)").fill(originalPrice);
  await saveSpeciesAndWaitForBanner(page);
  await page.goto("/uio");
  await expect(articleOf(page, SNAPPER.name)).toContainText(
    `$${(SNAPPER.pricePerKgCents / 100).toFixed(2)}`,
  );
});

test("changing a CUSTOM tier changes what the storefront card promises", async ({
  page,
}) => {
  await page.goto(`/admin/species/${SNAPPER.slug}`);

  const minInputs = page.getByLabel("Desde (kg)");
  const percentInputs = page.getByLabel("Descuento (%)");
  // The demo CUSTOM tiers are 0/0, 3/3 and 8/8 (kg / percent).
  await expect(minInputs.nth(2)).toHaveValue("8");
  await expect(percentInputs.nth(2)).toHaveValue("8");

  await percentInputs.nth(2).fill("9");
  await saveSpeciesAndWaitForBanner(page);

  await page.goto("/uio");
  await expect(articleOf(page, SNAPPER.name)).toContainText(
    "Desde 8 kg en tu pedido: 9% de descuento",
  );

  // Restore the demo tier.
  await page.goto(`/admin/species/${SNAPPER.slug}`);
  await page.getByLabel("Descuento (%)").nth(2).fill("8");
  await saveSpeciesAndWaitForBanner(page);
  await page.goto("/uio");
  await expect(articleOf(page, SNAPPER.name)).toContainText(
    "Desde 8 kg en tu pedido: 8% de descuento",
  );
});

test("a CUSTOM species without tiers is refused server-side", async ({ page }) => {
  await page.goto(`/admin/species/${SNAPPER.slug}`);

  // Remove every tier row: the quote engine refuses a CUSTOM line with no
  // tiers, so the panel must refuse the save instead of storing a species the
  // storefront cannot price.
  const quitar = page.getByRole("button", { name: /Quitar tramo/ });
  let remaining = await quitar.count();
  while (remaining > 0) {
    await quitar.first().click();
    remaining -= 1;
  }

  await saveSpecies(page);

  await expect(
    page.getByText("La política de tramos propios necesita al menos un tramo."),
  ).toBeVisible();
  await captureScreenshot(page, "admin-species-tiers-required");

  // Nothing was written: the demo tiers are still the ones the storefront
  // quotes.
  await page.goto("/uio");
  await expect(articleOf(page, SNAPPER.name)).toContainText(
    "Desde 8 kg en tu pedido: 8% de descuento",
  );
});

test("a seasonal species rejects an inverted window and accepts a valid one", async ({
  page,
}) => {
  await page.goto(`/admin/species/${LOBSTER.slug}`);

  await expect(page.getByRole("heading", { level: 2, name: "Temporadas" })).toBeVisible();
  const rowsBefore = await page.getByRole("row").count();

  // End before start: refused by the season domain, reported on the end field.
  await page.getByLabel("Inicio de temporada").fill("2027-03-01T00:00");
  await page.getByLabel("Fin de temporada").fill("2027-02-01T00:00");
  await page.getByRole("button", { name: "Agregar temporada" }).click();
  await expect(
    page.getByText("La fecha de fin no puede ser anterior a la de inicio."),
  ).toBeVisible();
  await expect(page.getByRole("row")).toHaveCount(rowsBefore);

  // A coherent window is stored and listed.
  await page.getByLabel("Inicio de temporada").fill("2027-03-01T00:00");
  await page.getByLabel("Fin de temporada").fill("2027-05-31T23:59");
  await page.getByRole("button", { name: "Agregar temporada" }).click();
  await expect(page.getByRole("row")).toHaveCount(rowsBefore + 1);

  // Restore: remove the window just added (the list is ordered by start, so it
  // is the last one).
  await page.getByRole("button", { name: "Quitar temporada" }).last().click();
  await expect(page.getByRole("row")).toHaveCount(rowsBefore);
});

test("creating a species validates the slug and lands on its edit page", async ({
  page,
}) => {
  const slug = `e2e-species-${Date.now().toString(36)}`;

  await page.goto("/admin/species/new");

  // An invalid slug is reported next to the field, with the shared message.
  await page.getByLabel("Slug").fill("Slug Invalido");
  await page.getByLabel("Nombre").fill("Especie de prueba");
  await page.getByLabel("Precio por kilo (USD)").fill("9.50");
  await page.getByRole("button", { name: "Crear especie" }).click();
  await expect(
    page.getByText("Usa solo letras minúsculas, números y guiones."),
  ).toBeVisible();
  await captureScreenshot(page, "admin-species-new-error");
  await expectNoSeriousAxeViolations(page);

  // A valid submission creates the species and opens its page.
  await page.getByLabel("Slug").fill(slug);
  await page.getByRole("button", { name: "Crear especie" }).click();

  // The success path redirects with the confirmation flag in the query. A
  // predicate instead of a pattern: the "?" of the query is a regex operator,
  // and escaping it inside a template literal silently turns it into "the
  // previous character is optional".
  await expect(page).toHaveURL(
    (url) =>
      url.pathname === `/admin/species/${slug}` &&
      url.searchParams.get("created") === "1",
  );
  await expect(page.getByRole("status")).toContainText("Especie creada.");
  await expect(page.getByRole("heading", { level: 1, name: "Especie de prueba" })).toBeVisible();
  // The new species exists but has no landing, so the storefront shows it
  // without stock instead of failing.
  await page.goto("/uio");
  await expect(articleOf(page, "Especie de prueba")).toBeVisible();
});
