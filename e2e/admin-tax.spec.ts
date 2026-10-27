// Tax (IVA) E2E (S1, S5, S6, S7): the in-force rate with its date, the two
// refusals the append-only history needs (backdated and duplicate), a
// future-dated rate stored and labelled as scheduled while the rate in force
// stays 15%, the storefront cart still quoting 15%, and axe on the page.
//
// Requires the local database migrated and demo-seeded BEFORE running:
//   pnpm db:seed && pnpm db:seed:demo
//
// Re-run safety: the panel is append-only, so a stored rate cannot be removed
// from the UI. The one row this spec writes carries an `E2E-tax-` note and
// `prisma/seed-demo.ts` purges those rows before the next demo seed. The
// scheduled row is always dated in the FUTURE: leaving a rate in force would
// hide the 15% the storefront and cart specs assert, so this spec never writes
// a rate that applies today.

import { expect, test, type Page } from "@playwright/test";

import { loginAsAdmin } from "./support/admin";
import { expectNoSeriousAxeViolations } from "./support/axe";
import { openCartWithItems } from "./support/cart";
import { SPECIES, TUNA_TIERS, totalsOf } from "./support/demo";
import { captureScreenshot } from "./support/screenshots";

/** The rate `prisma/seed.ts` leaves in force (S1). */
const SEED_STANDARD_PERCENT = "15%";

/** In-force table and history table, located by their accessible caption. */
function inForceTable(page: Page) {
  return page.getByRole("table", {
    name: /Tarifa de IVA vigente por categoría/,
  });
}

function historyTable(page: Page) {
  return page.getByRole("table", {
    name: /Historial completo de tarifas de IVA/,
  });
}

function inForceRow(page: Page, category: string) {
  return inForceTable(page).getByRole("row").filter({ hasText: category });
}

/**
 * Formats an instant as the Ecuador wall clock an HTML `datetime-local` input
 * takes. The panel parses the value back with the same zone (America/Guayaquil,
 * which has no DST), so the round trip is exact.
 */
function ecuadorDateTimeInput(instant: Date): string {
  const parts = new Map<string, string>();
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Guayaquil",
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  for (const part of formatter.formatToParts(instant)) {
    if (part.type !== "literal") {
      parts.set(part.type, part.value);
    }
  }
  return `${parts.get("year")}-${parts.get("month")}-${parts.get("day")}T${parts.get("hour")}:${parts.get("minute")}:${parts.get("second")}`;
}

/** Fills the register form; the caller submits and asserts. */
async function fillRegisterForm(
  page: Page,
  fields: { category: string; percent: string; effectiveFrom: string; note?: string },
): Promise<void> {
  await page.getByLabel("Categoría de IVA").selectOption(fields.category);
  await page.getByLabel("Porcentaje de IVA (%)").fill(fields.percent);
  await page.getByLabel("Vigente desde").fill(fields.effectiveFrom);
  if (fields.note !== undefined) {
    await page.getByLabel("Nota (opcional)").fill(fields.note);
  }
}

test.beforeEach(async ({ page }) => {
  await loginAsAdmin(page);
});

test("the page shows the IVA in force with its date and passes axe", async ({
  page,
}) => {
  await page.goto("/admin/tax");

  await expect(page.getByRole("heading", { level: 1, name: "IVA" })).toBeVisible();

  // S1/S7: the standard rate is 15%, dated 2024-04-01 00:00 in Ecuador, and the
  // zero rate is 0%. Both are read through the same formatters the page uses.
  const standard = inForceRow(page, "IVA estándar");
  await expect(standard).toContainText(SEED_STANDARD_PERCENT);
  await expect(standard).toContainText("1 de abril");
  await expect(standard).toContainText("00:00");
  await expect(inForceRow(page, "IVA 0%")).toContainText("0%");

  // S3: the history is listed and offers no way to edit or delete a row.
  await expect(historyTable(page)).toBeVisible();
  await expect(historyTable(page).getByRole("button")).toHaveCount(0);
  await expect(historyTable(page).getByRole("link")).toHaveCount(0);

  await captureScreenshot(page, "admin-tax");
  await expectNoSeriousAxeViolations(page);
});

test("a backdated rate is refused with the Spanish message and stores nothing", async ({
  page,
}) => {
  await page.goto("/admin/tax");
  const rowsBefore = await historyTable(page).getByRole("row").count();

  // S5: a past row could never be retracted from an append-only table, so the
  // panel refuses it instead of showing an in-force rate nobody chose.
  await fillRegisterForm(page, {
    category: "STANDARD",
    percent: "12",
    effectiveFrom: "2020-01-01T00:00",
  });
  await page.getByRole("button", { name: "Registrar tarifa" }).click();

  await expect(
    page.getByText(
      "La fecha debe ser posterior a la última tarifa registrada de esta categoría.",
    ),
  ).toBeVisible();
  await captureScreenshot(page, "admin-tax-backdated");

  // Nothing was written and the storefront rate is untouched.
  await expect(historyTable(page).getByRole("row")).toHaveCount(rowsBefore);
  await expect(inForceRow(page, "IVA estándar")).toContainText(
    SEED_STANDARD_PERCENT,
  );
});

test("a duplicate (category, effectiveFrom) is refused with the Spanish message", async ({
  page,
}) => {
  await page.goto("/admin/tax");
  const rowsBefore = await historyTable(page).getByRole("row").count();

  // The zero rate is seeded from 2000-01-01T00:00 Ecuador: the same date and
  // category is exactly the unique constraint the table enforces.
  await fillRegisterForm(page, {
    category: "ZERO_RATED",
    percent: "0",
    effectiveFrom: "2000-01-01T00:00",
  });
  await page.getByRole("button", { name: "Registrar tarifa" }).click();

  await expect(
    page.getByText("Ya existe una tarifa de esta categoría con esa fecha."),
  ).toBeVisible();
  await expect(historyTable(page).getByRole("row")).toHaveCount(rowsBefore);
});

test("a future-dated rate is scheduled: it is stored, labelled, and the cart still quotes 15%", async ({
  page,
}) => {
  await page.goto("/admin/tax");
  const rowsBefore = await historyTable(page).getByRole("row").count();

  // Dated 30 days ahead, derived from the current instant so a re-run is always
  // strictly later than the row the previous run left behind, and never in
  // force today (S5 allows a future date; the storefront must not see it).
  const scheduledInput = ecuadorDateTimeInput(
    new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
  );
  const note = `E2E-tax-scheduled-${new Date().toISOString()}`;

  await fillRegisterForm(page, {
    category: "STANDARD",
    percent: "12.5",
    effectiveFrom: scheduledInput,
    note,
  });
  await page.getByRole("button", { name: "Registrar tarifa" }).click();

  // The success path redirects with the confirmation flag and the history grew.
  await expect(page).toHaveURL(
    (url) =>
      url.pathname === "/admin/tax" && url.searchParams.get("created") === "1",
  );
  await expect(page.getByRole("status")).toContainText("Tarifa registrada.");
  await expect(historyTable(page).getByRole("row")).toHaveCount(rowsBefore + 1);

  // S7: the scheduled row is labelled and the rate in force is unchanged.
  const standard = inForceRow(page, "IVA estándar");
  await expect(standard).toContainText(SEED_STANDARD_PERCENT);
  await expect(standard).toContainText("Programada");
  await expect(standard).toContainText("desde");
  // The page states that the current rate still applies.
  await expect(
    page.getByText(/Una tarifa programada todavía no se aplica/),
  ).toBeVisible();

  // The history row keeps its audit note and its scheduled status. The note is
  // unique per run, so a row a previous (unseeded) run left behind cannot make
  // this locator ambiguous.
  const scheduledRow = historyTable(page)
    .getByRole("row")
    .filter({ hasText: note });
  await expect(scheduledRow).toContainText("12.5%");
  await expect(scheduledRow).toContainText("Programada");

  await captureScreenshot(page, "admin-tax-scheduled");
  await expectNoSeriousAxeViolations(page);

  // S6: the quote reads the table at the request instant, so the cart still
  // charges the 15% in force (the scheduled row does not leak into it).
  await openCartWithItems(page, [{ name: SPECIES.wahoo.name, kg: "4" }]);
  const expected = totalsOf([
    {
      grams: 4000,
      pricePerKgCents: SPECIES.wahoo.pricePerKgCents,
      tiers: TUNA_TIERS,
    },
  ]);
  const totalsRegion = page.getByRole("region", { name: "Totales" });
  await expect(totalsRegion).toContainText(expected.subtotal);
  await expect(totalsRegion).toContainText(expected.vat);
  await expect(totalsRegion).toContainText(expected.total);
});
