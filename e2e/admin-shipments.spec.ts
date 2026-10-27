// Admin flights E2E (A4): the list grouped per airport, scheduling a flight
// with the prefilled window, the domain window invariants, the future-cutoff
// rule, closing a flight and axe on both panel pages.
//
// Requires the local database migrated and demo-seeded with fresh relative
// dates BEFORE running:
//   pnpm db:seed && pnpm db:seed:demo
//
// The created flight carries an "E2E-" number plus a per-run id, so a suite
// re-run is independent of the previous one: `seed-demo.ts` does NOT remove
// E2E rows (it only clears DEMO-marked rows, see the follow-up in the
// handoff). Its cutoff is a week out, so even a leftover copy from a previous
// run is never the next orderable flight.

import { expect, test, type Page } from "@playwright/test";

import { loginAsAdmin } from "./support/admin";
import { expectNoSeriousAxeViolations } from "./support/axe";
import { FLIGHT_NUMBERS } from "./support/demo";
import { captureScreenshot } from "./support/screenshots";

/** Per-run suffix: keeps the flight number unique across runs. */
const RUN_ID = Date.now().toString(36);
const E2E_FLIGHT_NUMBER = `E2E-TEST-${RUN_ID}`;

const MS_PER_HOUR = 3_600_000;
const MS_PER_DAY = 24 * MS_PER_HOUR;
/** Ecuador mainland (America/Guayaquil) has no DST and is fixed at UTC-5. */
const ECUADOR_OFFSET_MS = 5 * MS_PER_HOUR;

/** Instant of `hourLocal` Ecuador wall-clock time, `daysFromNow` days ahead. */
function atEcuadorHour(daysFromNow: number, hourLocal: number): Date {
  const shifted = new Date(Date.now() + daysFromNow * MS_PER_DAY);
  const local = new Date(shifted.getTime() - ECUADOR_OFFSET_MS);
  return new Date(
    Date.UTC(
      local.getUTCFullYear(),
      local.getUTCMonth(),
      local.getUTCDate(),
      hourLocal + 5,
      0,
      0,
      0,
    ),
  );
}

/** `datetime-local` value of an instant, read as Ecuador wall-clock time. */
function datetimeLocalValue(date: Date): string {
  return new Date(date.getTime() - ECUADOR_OFFSET_MS).toISOString().slice(0, 16);
}

/** Row of the flights table identified by its flight number. */
function flightRow(page: Page, flightNumber: string) {
  return page.getByRole("row").filter({ hasText: flightNumber });
}

/** Fills the five window fields of the create-flight form. */
async function fillWindow(
  page: Page,
  window: { cutoff: Date; departs: Date; arrival: Date; pickupEnds: Date },
): Promise<void> {
  await page.getByLabel("Cierre de pedidos").fill(datetimeLocalValue(window.cutoff));
  await page.getByLabel("Salida").fill(datetimeLocalValue(window.departs));
  await page.getByLabel("Llegada estimada").fill(datetimeLocalValue(window.arrival));
  await page.getByLabel("Inicio de retiro").fill(datetimeLocalValue(window.arrival));
  await page.getByLabel("Fin de retiro").fill(datetimeLocalValue(window.pickupEnds));
}

test("the list groups the demo flights per airport and passes axe", async ({ page }) => {
  await loginAsAdmin(page);
  await page.goto("/admin/shipments");

  await expect(page.getByRole("heading", { level: 1, name: "Vuelos" })).toBeVisible();

  // One section per airport, in the storefront order, with the demo flights.
  await expect(page.getByRole("heading", { level: 2, name: /Quito \(UIO\)/ })).toBeVisible();
  await expect(page.getByRole("heading", { level: 2, name: /Guayaquil \(GYE\)/ })).toBeVisible();
  await expect(page.getByRole("heading", { level: 2, name: /Cuenca \(CUE\)/ })).toBeVisible();

  for (const flightNumber of Object.values(FLIGHT_NUMBERS)) {
    await expect(flightRow(page, flightNumber)).toBeVisible();
  }

  const scheduledRow = flightRow(page, FLIGHT_NUMBERS.UIO);
  await expect(scheduledRow).toContainText("Abierto");
  await expect(scheduledRow.getByRole("button", { name: "Cerrar" })).toBeVisible();

  // The completed demo flight is not SCHEDULED: no close action offered.
  const pastRow = flightRow(page, "DEMO-UIO-PAST");
  await expect(pastRow).toContainText("Completado");
  await expect(pastRow.getByRole("button", { name: "Cerrar" })).toHaveCount(0);

  await captureScreenshot(page, "admin-shipments");
  await expectNoSeriousAxeViolations(page);
});

test("a flight scheduled for next week appears in the list and keeps the demo flight as next", async ({
  page,
}) => {
  await loginAsAdmin(page);
  await page.goto("/admin/shipments/new");

  await expectNoSeriousAxeViolations(page);

  // Quito, a week out at the usual 18:00 cutoff, with the derived offsets.
  const cutoff = atEcuadorHour(7, 18);
  const departs = new Date(cutoff.getTime() + 14 * MS_PER_HOUR);
  const arrival = new Date(departs.getTime() + 2 * MS_PER_HOUR);
  const pickupEnds = new Date(arrival.getTime() + 3 * MS_PER_HOUR);

  await page.getByLabel("Aeropuerto").selectOption("UIO");
  await page.getByLabel("Número de vuelo (opcional)").fill(E2E_FLIGHT_NUMBER);
  await fillWindow(page, { cutoff, departs, arrival, pickupEnds });

  await page.getByRole("button", { name: "Programar vuelo" }).click();

  await expect(page).toHaveURL(/\/admin\/shipments\?created=1$/);
  await expect(page.getByRole("status")).toContainText("Vuelo programado.");

  const createdRow = flightRow(page, E2E_FLIGHT_NUMBER);
  await expect(createdRow).toContainText("Abierto");

  // The demo flight closes earlier, so the storefront keeps offering it.
  await page.goto("/uio");
  await expect(
    page.getByRole("heading", { level: 2, name: /Próximo vuelo a Quito/ }),
  ).toBeVisible();
  await expect(page.getByText(FLIGHT_NUMBERS.UIO, { exact: true })).toBeVisible();
});

test("an incoherent window is rejected with the domain invariant message", async ({ page }) => {
  await loginAsAdmin(page);
  await page.goto("/admin/shipments/new");

  // Arrival before departure violates departsAt < estimatedArrivalAt.
  const cutoff = atEcuadorHour(9, 18);
  const departs = new Date(cutoff.getTime() + 14 * MS_PER_HOUR);
  const arrival = new Date(departs.getTime() - 2 * MS_PER_HOUR);
  await fillWindow(page, {
    cutoff,
    departs,
    arrival,
    pickupEnds: new Date(departs.getTime() + 3 * MS_PER_HOUR),
  });

  await page.getByRole("button", { name: "Programar vuelo" }).click();

  await expect(page.getByText(/^Las fechas no son coherentes: /)).toBeVisible();
  await expect(page).toHaveURL(/\/admin\/shipments\/new$/);
  // The typed values are kept, so the operator only fixes the wrong one.
  await expect(page.getByLabel("Cierre de pedidos")).toHaveValue(
    datetimeLocalValue(cutoff),
  );
});

test("a cutoff in the past is rejected", async ({ page }) => {
  await loginAsAdmin(page);
  await page.goto("/admin/shipments/new");

  // Yesterday at 18:00: the window stays coherent (departure is later), so
  // only the future-cutoff rule can reject it.
  await fillWindow(page, {
    cutoff: atEcuadorHour(-1, 18),
    departs: atEcuadorHour(2, 8),
    arrival: atEcuadorHour(2, 10),
    pickupEnds: atEcuadorHour(2, 13),
  });

  await page.getByRole("button", { name: "Programar vuelo" }).click();

  await expect(page.getByText("El cierre de pedidos debe ser futuro.")).toBeVisible();
  await expect(page).toHaveURL(/\/admin\/shipments\/new$/);
});

test("closing a scheduled flight turns it into a closed one", async ({ page }) => {
  await loginAsAdmin(page);
  await page.goto("/admin/shipments");

  const row = flightRow(page, "DEMO-UIO-2");
  // After a fresh demo seed this flight is SCHEDULED and this test closes it.
  // `seed-demo.ts` recreates DEMO rows, so a re-run without re-seeding finds
  // it already CLOSED: the outcome asserted below is the same either way.
  const closeButton = row.getByRole("button", { name: "Cerrar" });
  if ((await closeButton.count()) > 0) {
    await closeButton.click();
  }

  await expect(row).toContainText("Cerrado");
  await expect(row.getByRole("button", { name: "Cerrar" })).toHaveCount(0);
});
