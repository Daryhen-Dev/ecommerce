// Cart E2E for S4. Requires the local database migrated and demo-seeded with
// fresh relative dates BEFORE running:
//   pnpm db:seed && pnpm db:seed:demo
//
// The expected totals are computed here from the demo constants with the same
// integer formulas the domain uses (round half up), never hardcoded guesses:
// Pargo $12.00/kg, CUSTOM tiers 0/3000 g -> 3%, 8000 g -> 8%; Atún aleta
// amarilla $11.00/kg, GLOBAL tiers 0/5000 g -> 5%, 10000 g -> 10%; VAT 15%.
import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

// --- demo constants (must mirror prisma/seed-demo.ts and prisma/seed.ts) ---
const SNAPPER_PRICE_PER_KG_CENTS = 1200;
const SNAPPER_TIERS: [number, number][] = [
  [0, 0],
  [3000, 300],
  [8000, 800],
];
const TUNA_PRICE_PER_KG_CENTS = 1100;
const TUNA_TIERS: [number, number][] = [
  [0, 0],
  [5000, 500],
  [10000, 1000],
];
const VAT_BPS = 1500;

// --- domain formulas (integer arithmetic, round half up) ---
function grossCentsOf(grams: number, pricePerKgCents: number): number {
  return Math.floor((grams * pricePerKgCents + 500) / 1000);
}
function percentOf(amount: number, bps: number): number {
  return Math.floor((amount * bps + 5000) / 10000);
}
function tierBps(tiers: [number, number][], totalGrams: number): number {
  let bps = 0;
  for (const [minTotalGrams, tierBps] of tiers) {
    if (minTotalGrams <= totalGrams) bps = tierBps;
  }
  return bps;
}
function formatUsd(cents: number): string {
  const whole = Math.floor(cents / 100);
  const fraction = String(cents % 100).padStart(2, "0");
  const grouped = String(whole).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return `$${grouped}.${fraction}`;
}

interface LineQuote {
  gross: number;
  discount: number;
  vat: number;
  total: number;
}

/** Expected per-line quote: tiers are selected by the cart's TOTAL grams. */
function lineQuoteOf(
  grams: number,
  pricePerKgCents: number,
  tiers: [number, number][],
  cartTotalGrams: number,
): LineQuote {
  const gross = grossCentsOf(grams, pricePerKgCents);
  const discount = percentOf(gross, tierBps(tiers, cartTotalGrams));
  const net = gross - discount;
  const vat = percentOf(net, VAT_BPS);
  return { gross, discount, vat, total: net + vat };
}

/** Expected cart totals for lines priced together at their total grams. */
function totalsOf(
  lines: { grams: number; pricePerKgCents: number; tiers: [number, number][] }[],
): { subtotal: string; discount: string; vat: string; total: string } {
  const totalGrams = lines.reduce((acc, l) => acc + l.grams, 0);
  const quotes = lines.map((l) => lineQuoteOf(l.grams, l.pricePerKgCents, l.tiers, totalGrams));
  const subtotal = quotes.reduce((acc, q) => acc + q.gross, 0);
  const discount = quotes.reduce((acc, q) => acc + q.discount, 0);
  const vat = quotes.reduce((acc, q) => acc + q.vat, 0);
  return {
    subtotal: formatUsd(subtotal),
    discount: formatUsd(discount),
    vat: formatUsd(vat),
    total: formatUsd(subtotal - discount + vat),
  };
}

const SNAPPER_NAME = "Pargo";
const TUNA_NAME = "Atún aleta amarilla";

function articleOf(page: Page, name: string) {
  return page.getByRole("article").filter({
    has: page.getByRole("heading", { name, exact: true }),
  });
}

async function addToCart(page: Page, name: string, kg: string) {
  const article = articleOf(page, name);
  await article.getByLabel("Cantidad (kg)").fill(kg);
  await article.getByRole("button", { name: "Agregar al carrito" }).click();
}

async function openCartWithItems(page: Page, items: { name: string; kg: string }[]) {
  await page.goto("/uio");
  for (const item of items) {
    await addToCart(page, item.name, item.kg);
  }
  await page.getByRole("link", { name: `Carrito (${items.length})` }).click();
  await expect(page).toHaveURL(/\/uio\/carrito$/);
  await expect(page.getByRole("region", { name: "Totales" })).toBeVisible();
}

test.describe("add to cart (/uio)", () => {
  test("shows the decimal-separator hint on every quantity input", async ({ page }) => {
    await page.goto("/uio");
    await expect(
      articleOf(page, SNAPPER_NAME).getByText("Usa punto para decimales, ej. 7.5"),
    ).toBeVisible();
  });

  test("adds 7.5 kg of Pargo, announces it and updates the cart link", async ({
    page,
  }) => {
    await page.goto("/uio");

    await addToCart(page, SNAPPER_NAME, "7.5");

    await expect(
      page.getByRole("status").filter({ hasText: "Agregado: 7.5 kg de Pargo" }),
    ).toBeVisible();
    await expect(
      page.getByRole("link", { name: "Carrito (1)" }),
    ).toBeVisible();
  });

  test("rejects 7,5 with the dot-decimal error", async ({ page }) => {
    await page.goto("/uio");
    await addToCart(page, SNAPPER_NAME, "7,5");
    await expect(
      articleOf(page, SNAPPER_NAME).getByRole("alert").filter({
        hasText: "Usa punto para decimales, ej. 7.5",
      }),
    ).toBeVisible();
    await expect(page.getByRole("link", { name: "Carrito (1)" })).toHaveCount(0);
  });

  test("rejects 0.3 with the minimum error", async ({ page }) => {
    await page.goto("/uio");
    await addToCart(page, SNAPPER_NAME, "0.3");
    await expect(
      articleOf(page, SNAPPER_NAME).getByText("El pedido mínimo es 1 kg"),
    ).toBeVisible();
  });

  test("rejects 1.3 with the step error", async ({ page }) => {
    await page.goto("/uio");
    await addToCart(page, SNAPPER_NAME, "1.3");
    await expect(
      articleOf(page, SNAPPER_NAME).getByText("Debe ser en pasos de 0.5 kg"),
    ).toBeVisible();
  });

  test("rejects 300 kg of Atún with the availability error", async ({ page }) => {
    await page.goto("/uio");
    await addToCart(page, TUNA_NAME, "300");
    await expect(
      articleOf(page, TUNA_NAME).getByText("Solo quedan 200 kg"),
    ).toBeVisible();
  });

  test("passes axe with the add-to-cart forms", async ({ page }) => {
    await page.goto("/uio");
    const results = await new AxeBuilder({ page }).analyze();
    const blocking = results.violations.filter(
      (violation) => violation.impact === "serious" || violation.impact === "critical",
    );
    if (blocking.length > 0) {
      console.log(JSON.stringify(blocking, null, 2));
    }
    expect(blocking).toEqual([]);
  });
});

test.describe("cart page (/uio/carrito)", () => {
  test("shows the server quote: 7.5 kg of Pargo with matching totals", async ({
    page,
  }) => {
    await openCartWithItems(page, [{ name: SNAPPER_NAME, kg: "7.5" }]);

    const line = page.getByRole("row").filter({ hasText: SNAPPER_NAME });
    await expect(line).toBeVisible();
    await expect(line).toContainText("7.5 kg");
    await expect(line).toContainText("$12.00");

    const expected = totalsOf([
      { grams: 7500, pricePerKgCents: SNAPPER_PRICE_PER_KG_CENTS, tiers: SNAPPER_TIERS },
    ]);
    const totalsRegion = page.getByRole("region", { name: "Totales" });
    await expect(totalsRegion).toContainText(expected.subtotal);
    await expect(totalsRegion).toContainText(expected.discount);
    await expect(totalsRegion).toContainText(expected.vat);
    await expect(totalsRegion).toContainText(expected.total);

    // Hand-computed: 7.5 kg x $12.00 = 9000, 3% tier = 270, net 8730,
    // VAT 15% = 1309.5 -> 1310 (half up), total 10040.
    await expect(totalsRegion).toContainText("$100.40");

    // Payment is out of scope: the button stays disabled with an explanation.
    const payButton = page.getByRole("button", { name: "Ir a pagar" });
    await expect(payButton).toBeDisabled();
    await expect(
      page.getByText("El pago en línea estará disponible pronto."),
    ).toBeVisible();
  });

  test("10.5 kg across species re-selects the volume tiers: Pargo 8%, Atún 10%", async ({
    page,
  }) => {
    await openCartWithItems(page, [
      { name: SNAPPER_NAME, kg: "7.5" },
      { name: TUNA_NAME, kg: "3" },
    ]);

    const snapperRow = page.getByRole("row").filter({ hasText: SNAPPER_NAME });
    const tunaRow = page.getByRole("row").filter({ hasText: TUNA_NAME });
    // Total 10.5 kg: Pargo (CUSTOM) reaches its 8 kg tier, Atún (GLOBAL)
    // reaches the 10 kg global tier.
    await expect(snapperRow).toContainText("8%");
    await expect(tunaRow).toContainText("10%");
    // "Subtotal sin IVA" column is the discounted net: Pargo 9000 − 720 =
    // 8280, Atún 3300 − 330 = 2970.
    await expect(snapperRow).toContainText("$82.80");
    await expect(tunaRow).toContainText("$29.70");

    const expected = totalsOf([
      { grams: 7500, pricePerKgCents: SNAPPER_PRICE_PER_KG_CENTS, tiers: SNAPPER_TIERS },
      { grams: 3000, pricePerKgCents: TUNA_PRICE_PER_KG_CENTS, tiers: TUNA_TIERS },
    ]);
    const totalsRegion = page.getByRole("region", { name: "Totales" });
    await expect(totalsRegion).toContainText(expected.subtotal);
    await expect(totalsRegion).toContainText(expected.discount);
    await expect(totalsRegion).toContainText(expected.vat);
    await expect(totalsRegion).toContainText(expected.total);
  });

  test("removing a line updates the totals and the remaining tier", async ({
    page,
  }) => {
    await openCartWithItems(page, [
      { name: SNAPPER_NAME, kg: "7.5" },
      { name: TUNA_NAME, kg: "3" },
    ]);

    await page.getByRole("button", { name: `Quitar ${SNAPPER_NAME}` }).click();

    const tunaRow = page.getByRole("row").filter({ hasText: TUNA_NAME });
    await expect(tunaRow).toBeVisible();
    // Atún alone is 3 kg: below the 5 kg global tier, so 0% discount.
    await expect(tunaRow).toContainText("0%");
    const expected = totalsOf([
      { grams: 3000, pricePerKgCents: TUNA_PRICE_PER_KG_CENTS, tiers: TUNA_TIERS },
    ]);
    const totalsRegion = page.getByRole("region", { name: "Totales" });
    await expect(totalsRegion).toContainText(expected.subtotal);
    await expect(totalsRegion).toContainText(expected.vat);
    await expect(totalsRegion).toContainText(expected.total);
  });

  test("reloading the page keeps the cart", async ({ page }) => {
    await openCartWithItems(page, [{ name: SNAPPER_NAME, kg: "7.5" }]);

    await page.reload();

    await expect(
      page.getByRole("row").filter({ hasText: SNAPPER_NAME }),
    ).toBeVisible();
    await expect(page.getByRole("region", { name: "Totales" })).toContainText(
      "$100.40",
    );
  });

  test("removing the last line shows the empty state", async ({ page }) => {
    await openCartWithItems(page, [{ name: SNAPPER_NAME, kg: "7.5" }]);

    await page.getByRole("button", { name: `Quitar ${SNAPPER_NAME}` }).click();

    await expect(page.getByText("Tu carrito está vacío")).toBeVisible();
    await expect(
      page.getByRole("link", { name: /Volver al catálogo|catálogo/ }),
    ).toBeVisible();
  });

  test("a cart saved for an old shipment shows the stale-flight message", async ({
    page,
  }) => {
    await page.addInitScript(() => {
      window.localStorage.setItem(
        "cart:v1:old-shipment-id",
        JSON.stringify({ items: [{ slug: "snapper", grams: 7500 }] }),
      );
    });
    await page.goto("/uio/carrito");

    await expect(
      page.getByText("El vuelo de tu carrito ya cerró pedidos. Elige tu pedido para el próximo vuelo."),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: /Vaciar carrito/ }),
    ).toBeVisible();
  });

  test("passes axe with one line", async ({ page }) => {
    await openCartWithItems(page, [{ name: SNAPPER_NAME, kg: "7.5" }]);

    const results = await new AxeBuilder({ page }).analyze();
    const blocking = results.violations.filter(
      (violation) => violation.impact === "serious" || violation.impact === "critical",
    );
    if (blocking.length > 0) {
      console.log(JSON.stringify(blocking, null, 2));
    }
    expect(blocking).toEqual([]);
  });
});
