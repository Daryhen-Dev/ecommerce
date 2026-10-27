// Keyboard-only journey for S5: city choice -> add to cart -> cart update ->
// remove line, without a single mouse click. A bounded tab-walk helper makes
// a focus-order regression fail with a clear message instead of hanging.
//
// Requires the local database migrated and demo-seeded with fresh relative
// dates BEFORE running:
//   pnpm db:seed && pnpm db:seed:demo
import { test, expect, type Locator, type Page } from "@playwright/test";

import { SPECIES, SNAPPER_TIERS, totalsOf } from "./support/demo";
import { articleOf } from "./support/cart";

const SNAPPER = SPECIES.snapper;

async function isFocused(target: Locator): Promise<boolean> {
  try {
    return await target.evaluate((element) => element === document.activeElement);
  } catch {
    return false; // not attached (yet)
  }
}

/**
 * Presses Tab (or Shift+Tab) until `target` receives focus. Bounded at 40
 * presses; fails naming the element so a broken tab order is actionable.
 */
async function tabUntil(
  page: Page,
  target: Locator,
  description: string,
  direction: "forward" | "backward" = "forward",
): Promise<void> {
  const maxTabs = 40;
  const key = direction === "forward" ? "Tab" : "Shift+Tab";
  for (let pressed = 0; pressed <= maxTabs; pressed += 1) {
    if (await isFocused(target)) return;
    if (pressed === maxTabs) break;
    await page.keyboard.press(key);
  }
  throw new Error(
    `Keyboard could not reach ${description} within ${maxTabs} ${key} presses.`,
  );
}

test("keyboard-only journey: pick city, add 7.5 kg, update to 8 kg, remove", async ({
  page,
}) => {
  // 1. City picker: Tab to Quito, Enter opens /uio.
  await page.goto("/");

  const quitoLink = page.getByRole("link", { name: /Quito/ });
  await tabUntil(page, quitoLink, "the Quito city link");
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/uio$/);
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Quito");

  // 2. Catalog: Tab to the Pargo quantity input, type the amount.
  const quantityInput = articleOf(page, SNAPPER.name).getByLabel("Cantidad (kg)");
  await tabUntil(page, quantityInput, "the Pargo quantity input");
  await page.keyboard.type("7.5");

  const addButton = articleOf(page, SNAPPER.name).getByRole("button", {
    name: "Agregar al carrito",
  });
  await tabUntil(page, addButton, "the Pargo add-to-cart button");

  // Visible focus for keyboard users: the button must show a non-none
  // outline (or box-shadow) while :focus-visible.
  const focusStyle = await addButton.evaluate((element) => {
    const style = window.getComputedStyle(element);
    return {
      outlineStyle: style.outlineStyle,
      outlineWidth: style.outlineWidth,
      boxShadow: style.boxShadow,
    };
  });
  expect(
    focusStyle.outlineStyle !== "none" && focusStyle.outlineWidth !== "0px",
    `add button needs a visible :focus-visible outline, got ${JSON.stringify(focusStyle)}`,
  ).toBe(true);

  await page.keyboard.press("Enter");
  await expect(
    page.getByRole("status").filter({ hasText: "Agregado: 7.5 kg de Pargo" }),
  ).toBeVisible();

  // 3. The form returns focus to the quantity input and the cart link sits
  // BEFORE it in the DOM, so walk backwards to reach "Carrito (1)".
  const cartLink = page.getByRole("link", { name: "Carrito (1)" });
  await tabUntil(page, cartLink, "the Carrito (1) link", "backward");
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/uio\/carrito$/);

  // 4. Cart: change Pargo to 8 kg and commit the way CartView expects — the
  // input commits on blur (and on form submit), so Tab out.
  const cartQuantity = page.getByLabel("Cantidad de Pargo en kg");
  await tabUntil(page, cartQuantity, "the cart Pargo quantity input");
  await page.keyboard.press("ControlOrMeta+a");
  await page.keyboard.type("8");
  await page.keyboard.press("Tab");

  const row = page.getByRole("row").filter({ hasText: SNAPPER.name });
  await expect(row).toContainText("8 kg");

  const expected = totalsOf([
    { grams: 8000, pricePerKgCents: SNAPPER.pricePerKgCents, tiers: SNAPPER_TIERS },
  ]);
  const totals = page.getByRole("region", { name: "Totales" });
  // Hand-computed: 8 kg x $12.00 = $96.00, 8% tier, VAT 15% -> $101.57
  // (was $100.40 at 7.5 kg: the totals really updated).
  await expect(totals).toContainText(expected.subtotal);
  await expect(totals).toContainText(expected.total);
  await expect(totals).toContainText("$101.57");

  // 5. Remove the line with the keyboard: empty state.
  const removeButton = page.getByRole("button", { name: `Quitar ${SNAPPER.name}` });
  await tabUntil(page, removeButton, "the Quitar Pargo button");
  await page.keyboard.press("Enter");

  await expect(page.getByText("Tu carrito está vacío")).toBeVisible();
  await expect(
    page.getByRole("link", { name: /Volver al catálogo/ }),
  ).toBeVisible();
});
