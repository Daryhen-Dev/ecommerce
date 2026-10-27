// Admin orders E2E (A6): the per-shipment order list with its pickup codes,
// customers and locked totals, the flight selector, the two manual status
// transitions, the server-side refusal of an illegal transition and axe on the
// section.
//
// Requires the local database migrated and demo-seeded BEFORE running:
//   pnpm db:seed && pnpm db:seed:demo
//
// Re-run safety: the transition tests change the seeded pending order to PAID,
// which no spec can undo through the panel, so every test starts by re-running
// the idempotent demo seed (delete-then-recreate of the `DEMO-` rows). The seed
// runs in a single transaction and only touches `DEMO-` marked rows, so the
// rest of the suite sees the same data it would see without it. The seeded PAID
// order is a separate row from the one the specs transition, so an assertion on
// "a paid order" never depends on the transition having happened.

import { execSync } from "node:child_process";

import { expect, test, type Page } from "@playwright/test";

import { loginAsAdmin } from "./support/admin";
import { expectNoSeriousAxeViolations } from "./support/axe";
import { SNAPPER_TIERS, SPECIES, TUNA_TIERS, totalsOf } from "./support/demo";
import { captureScreenshot } from "./support/screenshots";

const PENDING_CODE = "DEMO-ORDER-PENDING";
const PAID_CODE = "DEMO-ORDER-PAID";
const CANCELLED_CODE = "DEMO-ORDER-CANCELLED";

const REFUSAL_MESSAGE = "Ese pedido ya no admite ese cambio de estado.";

// Expected money of the seeded orders, computed with the same integer formulas
// the domain uses (see `prisma/seed-demo.ts` for the seeded lines):
// - PAID: 6 kg Atún + 2 kg Bacalao, 8 kg total
// - PENDING: 4 kg Wahoo + 4 kg Pargo, 8 kg total
// - CANCELLED: 3 kg Pargo + 3 kg Wahoo, 6 kg total
const PENDING_TOTALS = totalsOf([
  { grams: 4000, pricePerKgCents: SPECIES.wahoo.pricePerKgCents, tiers: TUNA_TIERS },
  { grams: 4000, pricePerKgCents: SPECIES.snapper.pricePerKgCents, tiers: SNAPPER_TIERS },
]);
const PAID_TOTALS = totalsOf([
  { grams: 6000, pricePerKgCents: SPECIES.tuna.pricePerKgCents, tiers: TUNA_TIERS },
  { grams: 2000, pricePerKgCents: SPECIES.grouper.pricePerKgCents, tiers: TUNA_TIERS },
]);

/** One order card of the page, identified by its pickup code. */
function orderCard(page: Page, code: string) {
  return page.getByRole("article").filter({ hasText: code });
}

/** Re-runs the idempotent demo seed so every test starts from the same state. */
function resetDemoData(): void {
  execSync("pnpm db:seed:demo", { cwd: process.cwd(), stdio: "pipe" });
}

test.beforeEach(async ({ page }) => {
  resetDemoData();
  await loginAsAdmin(page);
});

test("the default flight lists its orders with pickup code, customer and locked totals", async ({
  page,
}) => {
  await page.goto("/admin/orders");

  await expect(page.getByRole("heading", { level: 1, name: "Pedidos" })).toBeVisible();

  // Default selection: the newest flight that already has orders, so the
  // section is never empty while there is something to show.
  const flightSelect = page.getByLabel("Vuelo");
  await expect(flightSelect.locator("option:checked")).toContainText("DEMO-UIO-1");

  const pending = orderCard(page, PENDING_CODE);
  await expect(pending).toBeVisible();
  await expect(pending.getByText("Código de retiro")).toBeVisible();
  await expect(pending).toContainText(PENDING_CODE);
  await expect(pending).toContainText("María Fernanda Chávez Ruiz");
  await expect(pending).toContainText("0991234567");
  await expect(pending).toContainText("Pendiente de pago");

  // Items: species, kilos and the line total stored at order time.
  await expect(pending).toContainText("Wahoo (Guajo)");
  await expect(pending).toContainText("4 kg");
  await expect(pending).toContainText("$39.33");
  await expect(pending).toContainText("Pargo");
  await expect(pending).toContainText("$50.78");

  // Totals as locked, never recomputed from today's prices.
  await expect(pending).toContainText("Subtotal");
  await expect(pending).toContainText(PENDING_TOTALS.subtotal);
  await expect(pending).toContainText(PENDING_TOTALS.discount);
  await expect(pending).toContainText(PENDING_TOTALS.vat);
  await expect(pending).toContainText(PENDING_TOTALS.total);

  // The other two seeded orders show their own state and their own totals.
  const paid = orderCard(page, PAID_CODE);
  await expect(paid).toContainText("Pagado");
  await expect(paid).toContainText("Jorge Luis Andrade Salazar");
  await expect(paid).toContainText(PAID_TOTALS.total);

  const cancelled = orderCard(page, CANCELLED_CODE);
  await expect(cancelled).toContainText("Cancelado");
  await expect(cancelled).toContainText("Ana Belén Cedeño Morán");

  // Only the pending order offers actions: the section is read-only otherwise.
  await expect(pending.getByRole("button", { name: "Marcar pagado" })).toBeVisible();
  await expect(pending.getByRole("button", { name: "Cancelar" })).toBeVisible();
  await expect(paid.getByRole("button")).toHaveCount(0);
  await expect(cancelled.getByRole("button")).toHaveCount(0);

  await captureScreenshot(page, "admin-orders");
  await expectNoSeriousAxeViolations(page);
});

test("the flight selector switches the order list", async ({ page }) => {
  await page.goto("/admin/orders");

  const flightSelect = page.getByLabel("Vuelo");
  const otherFlight = flightSelect.locator("option", { hasText: "DEMO-GYE-1" });
  await flightSelect.selectOption({ label: (await otherFlight.innerText()).trim() });
  await page.getByRole("button", { name: "Ver pedidos" }).click();

  await expect(page).toHaveURL(/\/admin\/orders\?shipment=/);
  await expect(page.getByText("Este vuelo no tiene pedidos todavía.")).toBeVisible();
  await expect(orderCard(page, PENDING_CODE)).toHaveCount(0);

  await captureScreenshot(page, "admin-orders-empty-flight");
  await expectNoSeriousAxeViolations(page);
});

test("a pending order can be marked paid and the change is stored", async ({ page }) => {
  await page.goto("/admin/orders");

  const pending = orderCard(page, PENDING_CODE);
  await expect(pending).toContainText("Pendiente de pago");
  await pending.getByRole("button", { name: "Marcar pagado" }).click();

  await expect(pending).toContainText("Pagado");
  await expect(pending.getByRole("button", { name: "Marcar pagado" })).toHaveCount(0);
  // A paid order is not cancellable from the panel: no refund button appears.
  await expect(pending.getByRole("button", { name: "Cancelar" })).toHaveCount(0);

  // The status is persisted, not just optimistic UI.
  await page.reload();
  const reloaded = orderCard(page, PENDING_CODE);
  await expect(reloaded).toContainText("Pagado");
  await expect(reloaded.getByRole("button")).toHaveCount(0);

  // The seeded paid order is a different row and is still paid.
  await expect(orderCard(page, PAID_CODE)).toContainText("Pagado");
});

test("a pending order can be cancelled and the change is stored", async ({ page }) => {
  await page.goto("/admin/orders");

  const pending = orderCard(page, PENDING_CODE);
  await expect(pending).toContainText("Pendiente de pago");
  await pending.getByRole("button", { name: "Cancelar" }).click();

  await expect(pending).toContainText("Cancelado");
  await expect(pending.getByRole("button")).toHaveCount(0);

  // Stored, and scoped: cancelling one row leaves its neighbours alone.
  await page.reload();
  await expect(orderCard(page, PENDING_CODE)).toContainText("Cancelado");
  await expect(orderCard(page, PAID_CODE)).toContainText("Pagado");
});

test("an illegal transition is refused by the server with a Spanish message", async ({
  page,
  context,
}) => {
  // This tab renders the order while it is still pending: it offers "Cancelar".
  await page.goto("/admin/orders");
  const stalePending = orderCard(page, PENDING_CODE);
  await expect(stalePending).toContainText("Pendiente de pago");

  // Another tab pays the same order first.
  const otherTab = await context.newPage();
  await otherTab.goto("/admin/orders");
  await orderCard(otherTab, PENDING_CODE)
    .getByRole("button", { name: "Marcar pagado" })
    .click();
  await expect(orderCard(otherTab, PENDING_CODE)).toContainText("Pagado");

  // The stale tab still shows the pending row, so the request it submits is
  // now illegal: the server must refuse it, not apply it.
  const cancelButton = stalePending.getByRole("button", { name: "Cancelar" });
  await expect(cancelButton).toBeVisible();
  await cancelButton.click();

  await expect(stalePending.getByRole("alert")).toContainText(REFUSAL_MESSAGE);
  // The refusal reaches the operator as one visible alert, not as a hidden
  // state field: `first()` because the message node is nested in its alert.
  await expect(page.getByText(REFUSAL_MESSAGE).first()).toBeVisible();

  // Nothing was written: the order is still paid, never cancelled.
  await page.reload();
  const reloaded = orderCard(page, PENDING_CODE);
  await expect(reloaded).toContainText("Pagado");
  await expect(page.getByText("Cancelado", { exact: true })).toHaveCount(1);

  await otherTab.close();
});
