// Shared cart interactions for the E2E specs: species-card locators, the
// mouse add-to-cart flow used to stage carts, and helpers to tamper with the
// per-shipment localStorage cart directly (defensive server behavior tests).
import { expect, type Locator, type Page } from "@playwright/test";

/** The species article whose heading is exactly `name`. */
export function articleOf(page: Page, name: string): Locator {
  return page.getByRole("article").filter({
    has: page.getByRole("heading", { name, exact: true }),
  });
}

/** Adds `kg` of the species via the catalog card form (mouse flow). */
export async function addToCart(page: Page, name: string, kg: string): Promise<void> {
  const article = articleOf(page, name);
  await article.getByLabel("Cantidad (kg)").fill(kg);
  await article.getByRole("button", { name: "Agregar al carrito" }).click();
}

/** Stages a cart with the given items through the catalog UI, then opens the cart page. */
export async function openCartWithItems(
  page: Page,
  items: { name: string; kg: string }[],
): Promise<void> {
  await page.goto("/uio");
  for (const item of items) {
    await addToCart(page, item.name, item.kg);
  }
  await page.getByRole("link", { name: `Carrito (${items.length})` }).click();
  await expect(page).toHaveURL(/\/uio\/carrito$/);
  await expect(page.getByRole("region", { name: "Totales" })).toBeVisible();
}

/**
 * The localStorage key of the CURRENT shipment's cart, learned from a real
 * add-to-cart (the UI, not the test, decides the shipment id): stage one
 * item with `addToCart` on /uio first, then call this.
 */
export async function currentCartStorageKey(page: Page): Promise<string> {
  const key = await page.evaluate(() =>
    Object.keys(window.localStorage).find(
      (k) => k.startsWith("cart:v1:") && k.length > "cart:v1:".length,
    ),
  );
  if (key === undefined) {
    throw new Error(
      "No cart:v1:<shipmentId> key found; stage a cart item before tampering.",
    );
  }
  return key;
}

/** Overwrites the current shipment's cart with a single hand-crafted line. */
export async function tamperCartWith(
  page: Page,
  key: string,
  item: { slug: string; grams: number },
): Promise<void> {
  await page.evaluate(
    ([storageKey, cartItem]) => {
      window.localStorage.setItem(
        storageKey as string,
        JSON.stringify({ items: [cartItem] }),
      );
    },
    [key, item],
  );
}
