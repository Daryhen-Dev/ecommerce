// Admin landings E2E (A3): the list with its statuses and filter, creating a
// landing, the storefront reflecting the new availability immediately,
// closing it (availability returns), the duplicate-landing warning, the
// server-side field validation and axe on both panel pages.
//
// Requires the local database migrated and demo-seeded with fresh relative
// dates BEFORE running:
//   pnpm db:seed && pnpm db:seed:demo
//
// Every landing created here is closed before its test ends and carries an
// "E2E-" note plus a per-run id, so a suite re-run is independent of the
// previous one: `seed-demo.ts` does NOT remove E2E rows (it only clears rows
// with the DEMO marker, see the follow-up in the handoff), and the
// availability assertions below are relative to the live baseline instead of
// a hardcoded demo number.

import { expect, test, type Page } from "@playwright/test";

import { loginAsAdmin } from "./support/admin";
import { expectNoSeriousAxeViolations } from "./support/axe";
import { articleOf } from "./support/cart";
import { SPECIES } from "./support/demo";
import { captureScreenshot } from "./support/screenshots";

const WAHOO = SPECIES.wahoo;
const SNAPPER = SPECIES.snapper;

/** Per-run suffix: keeps notes unique across runs that share one database. */
const RUN_ID = Date.now().toString(36);

// Weights carry a per-run fraction (three decimals, the panel's precision) so
// an OPEN leftover from an interrupted run can never fake a duplicate.
const RUN_FRACTION = (Number.parseInt(RUN_ID, 36) % 1000).toString().padStart(3, "0");
const WAHOO_KG = `3.${RUN_FRACTION}`;
const WAHOO_GRAMS = 3000 + Number(RUN_FRACTION);
const SNAPPER_KG = `5.${((Number(RUN_FRACTION) + 137) % 1000).toString().padStart(3, "0")}`;

/** Row of the landings table identified by its note. */
function lotRow(page: Page, note: string) {
  return page.getByRole("row").filter({ hasText: note });
}

/**
 * Free grams the storefront shows for one species on /uio, read from the
 * availability badge ("Disponible: 90 kg").
 */
async function uioAvailableGrams(page: Page, speciesName: string): Promise<number> {
  await page.goto("/uio");
  const text = await articleOf(page, speciesName)
    .getByText(/^Disponible: /)
    .innerText();
  const match = /^Disponible:\s+([\d.]+)\s*kg$/.exec(text.trim());
  if (match === null) {
    throw new Error(`unexpected availability text: ${JSON.stringify(text)}`);
  }
  return Math.round(Number(match[1]) * 1000);
}

/** Fills the create-landing form. `landedAt` keeps the prefilled "now". */
async function submitNewLot(
  page: Page,
  input: { speciesName: string; kg: string; notes: string },
): Promise<void> {
  await page.goto("/admin/lots/new");
  await page.getByLabel("Especie").selectOption({ label: input.speciesName });
  await page.getByLabel("Peso total (kg)").fill(input.kg);
  await page.getByLabel("Comentario (opcional)").fill(input.notes);
  await page.getByRole("button", { name: "Registrar desembarque" }).click();
}

/**
 * Kilogram label the storefront renders: same rule as the domain's
 * `formatKilograms` (dot decimal, up to three decimals, no trailing zeros),
 * so an odd per-run weight still matches exactly.
 */
function kgLabel(gramsValue: number): string {
  const whole = Math.floor(gramsValue / 1000);
  const remainder = gramsValue % 1000;
  if (remainder === 0) {
    return `${whole} kg`;
  }
  const fraction = String(remainder).padStart(3, "0").replace(/0+$/, "");
  return `${whole}.${fraction} kg`;
}

/** Storefront availability text of one species on /uio. */
function uioAvailability(page: Page, speciesName: string) {
  return articleOf(page, speciesName).getByText(/^Disponible: /);
}

/**
 * Closes every landing a previous interrupted run left OPEN (notes with the
 * "E2E-" marker), through the panel itself. Two reasons:
 * - the storefront availability baseline other specs rely on must not stay
 *   inflated by a failed run;
 * - closing is idempotent, so this is safe on a freshly seeded database too.
 */
async function closeLeftoverLandings(page: Page): Promise<void> {
  await page.goto("/admin/lots");
  const closeButtons = page
    .getByRole("row")
    .filter({ hasText: "E2E-" })
    .getByRole("button", { name: "Cerrar" });

  let remaining = await closeButtons.count();
  let guard = 0;
  while (remaining > 0 && guard < 20) {
    await closeButtons.first().click();
    await expect(closeButtons).toHaveCount(remaining - 1);
    remaining -= 1;
    guard += 1;
  }
}

test.beforeEach(async ({ page }) => {
  await loginAsAdmin(page);
  await closeLeftoverLandings(page);
});

test("the list shows the demo landings with their status and filters by species", async ({
  page,
}) => {
  await page.goto("/admin/lots");

  await expect(page.getByRole("heading", { level: 1, name: "Desembarques" })).toBeVisible();

  // An OPEN landing renders its status as text and offers the close button.
  const openRow = lotRow(page, "DEMO-lot-wahoo-open");
  await expect(openRow).toContainText("Abierto");
  await expect(openRow.getByRole("button", { name: "Cerrar" })).toBeVisible();

  // A CLOSED landing says so and offers no action.
  const closedRow = lotRow(page, "DEMO-lot-yellowfin-tuna-closed");
  await expect(closedRow).toContainText("Cerrado");
  await expect(closedRow.getByRole("button", { name: "Cerrar" })).toHaveCount(0);

  await captureScreenshot(page, "admin-lots");
  await expectNoSeriousAxeViolations(page);

  // Species filter: the URL param drives the query, not client-side hiding.
  await page.getByLabel("Filtrar por especie").selectOption({ label: WAHOO.name });
  await page.getByRole("button", { name: "Filtrar" }).click();

  await expect(page).toHaveURL(/\/admin\/lots\?species=wahoo$/);
  await expect(lotRow(page, "DEMO-lot-wahoo-open")).toBeVisible();
  await expect(lotRow(page, "DEMO-lot-snapper-open")).toHaveCount(0);

  await captureScreenshot(page, "admin-lots-filtered-wahoo");
});

test("the create form reports field errors and passes axe", async ({ page }) => {
  await page.goto("/admin/lots/new");

  // Nothing selected and a weight below the 0.5 kg minimum: both messages
  // come from the server, in one pass.
  await page.getByLabel("Peso total (kg)").fill("0.4");
  await page.getByRole("button", { name: "Registrar desembarque" }).click();

  await expect(page.getByText("Elige una opción válida para el desembarque.")).toBeVisible();
  await expect(page.getByText("El peso total mínimo es 0.5 kg")).toBeVisible();

  await captureScreenshot(page, "admin-lots-new-error");
  await expectNoSeriousAxeViolations(page);
});

test("a new landing raises the storefront availability and closing it lowers it again", async ({
  page,
}) => {
  // Baseline from the live data (the demo seed leaves Wahoo at 90 kg free:
  // 120 kg - 30 kg reserved).
  const before = await uioAvailableGrams(page, WAHOO.name);
  const createdNote = `E2E-lot-wahoo-${RUN_ID}`;

  await submitNewLot(page, { speciesName: WAHOO.name, kg: WAHOO_KG, notes: createdNote });

  await expect(page).toHaveURL(/\/admin\/lots\?created=1$/);
  await expect(page.getByRole("status")).toContainText("Desembarque registrado.");
  await expect(lotRow(page, createdNote)).toContainText(`${WAHOO_KG} kg`);

  // The storefront reads OPEN lots, so the new kilos are sellable at once.
  await page.goto("/uio");
  await expect(uioAvailability(page, WAHOO.name)).toHaveText(
    `Disponible: ${kgLabel(before + WAHOO_GRAMS)}`,
  );

  // Closing keeps the reservations but stops the sale.
  await page.goto("/admin/lots");
  const createdRow = lotRow(page, createdNote);
  await createdRow.getByRole("button", { name: "Cerrar" }).click();
  await expect(createdRow).toContainText("Cerrado");
  await expect(createdRow.getByRole("button", { name: "Cerrar" })).toHaveCount(0);

  await page.goto("/uio");
  await expect(uioAvailability(page, WAHOO.name)).toHaveText(
    `Disponible: ${kgLabel(before)}`,
  );
});

test("an identical landing on the same day warns instead of duplicating silently", async ({
  page,
}) => {
  const firstNote = `E2E-lot-snapper-${RUN_ID}-a`;
  await submitNewLot(page, { speciesName: SNAPPER.name, kg: SNAPPER_KG, notes: firstNote });
  await expect(page).toHaveURL(/\/admin\/lots\?created=1$/);

  // Same species, same day (the form defaults to now) and same weight.
  await submitNewLot(page, {
    speciesName: SNAPPER.name,
    kg: SNAPPER_KG,
    notes: `E2E-lot-snapper-${RUN_ID}-b`,
  });

  await expect(
    page.getByText("Ya existe un desembarque igual para esa fecha."),
  ).toBeVisible();
  await expect(page).toHaveURL(/\/admin\/lots\/new$/);

  // Cleanup: close the landing created by the first half of this test so the
  // Pargo availability the storefront specs assert is back to its base value.
  await page.goto("/admin/lots");
  const firstRow = lotRow(page, firstNote);
  await firstRow.getByRole("button", { name: "Cerrar" }).click();
  await expect(firstRow).toContainText("Cerrado");
});
