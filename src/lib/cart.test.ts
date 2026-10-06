// Unit tests for the pure client cart logic: immutable state transitions,
// localStorage key/value handling and the shared quantity input validation.
// No React, no localStorage access: storage shapes are plain strings.

import { describe, expect, it } from "vitest";

import {
  CART_KEY_PREFIX,
  addItem,
  cartStorageKey,
  clearCart,
  emptyCart,
  gramsForSlug,
  parseStoredCart,
  removeItem,
  setItemQuantity,
  shipmentIdFromKey,
  validateQuantityInput,
  type CartState,
} from "./cart";

function stateOf(...items: { slug: string; grams: number }[]): CartState {
  return { items };
}

describe("addItem", () => {
  it("adds a new line to an empty cart", () => {
    expect(addItem(emptyCart(), "snapper", 7500)).toEqual({
      items: [{ slug: "snapper", grams: 7500 }],
    });
  });

  it("merges duplicates by slug and sums the grams", () => {
    const state = stateOf(
      { slug: "snapper", grams: 7500 },
      { slug: "wahoo", grams: 2000 },
    );
    expect(addItem(state, "snapper", 1500)).toEqual({
      items: [
        { slug: "snapper", grams: 9000 },
        { slug: "wahoo", grams: 2000 },
      ],
    });
  });

  it("keeps the original line order when merging", () => {
    const state = stateOf(
      { slug: "wahoo", grams: 2000 },
      { slug: "snapper", grams: 7500 },
    );
    expect(addItem(state, "snapper", 500).items.map((i) => i.slug)).toEqual([
      "wahoo",
      "snapper",
    ]);
  });

  it("never mutates the input state", () => {
    const state = stateOf({ slug: "snapper", grams: 7500 });
    addItem(state, "snapper", 500);
    expect(state).toEqual({ items: [{ slug: "snapper", grams: 7500 }] });
  });

  it("rejects invalid grams and slugs", () => {
    const state = emptyCart();
    expect(() => addItem(state, "snapper", 0)).toThrow();
    expect(() => addItem(state, "snapper", -500)).toThrow();
    expect(() => addItem(state, "snapper", 1.5)).toThrow();
    expect(() => addItem(state, "snapper", Number.MAX_SAFE_INTEGER + 1)).toThrow();
    expect(() => addItem(state, "", 500)).toThrow();
    expect(() => addItem(state, "Snapper", 500)).toThrow();
  });
});

describe("setItemQuantity", () => {
  it("replaces the quantity of an existing line", () => {
    const state = stateOf({ slug: "snapper", grams: 7500 });
    expect(setItemQuantity(state, "snapper", 3000)).toEqual({
      items: [{ slug: "snapper", grams: 3000 }],
    });
  });

  it("appends a line for a slug that is not in the cart yet", () => {
    const state = stateOf({ slug: "snapper", grams: 7500 });
    expect(setItemQuantity(state, "wahoo", 2000)).toEqual({
      items: [
        { slug: "snapper", grams: 7500 },
        { slug: "wahoo", grams: 2000 },
      ],
    });
  });

  it("never mutates the input state and rejects invalid input", () => {
    const state = stateOf({ slug: "snapper", grams: 7500 });
    setItemQuantity(state, "snapper", 3000);
    expect(state.items[0].grams).toBe(7500);
    expect(() => setItemQuantity(state, "snapper", 0)).toThrow();
  });
});

describe("removeItem", () => {
  it("removes only the given slug", () => {
    const state = stateOf(
      { slug: "snapper", grams: 7500 },
      { slug: "wahoo", grams: 2000 },
    );
    expect(removeItem(state, "snapper")).toEqual({
      items: [{ slug: "wahoo", grams: 2000 }],
    });
  });

  it("returns an equal state when the slug is not in the cart", () => {
    const state = stateOf({ slug: "snapper", grams: 7500 });
    expect(removeItem(state, "wahoo")).toEqual(state);
  });
});

describe("clearCart and emptyCart", () => {
  it("clears every line", () => {
    expect(clearCart()).toEqual({ items: [] });
    expect(emptyCart()).toEqual({ items: [] });
  });
});

describe("gramsForSlug", () => {
  it("returns the grams of the line and 0 for absent slugs", () => {
    const state = stateOf({ slug: "snapper", grams: 7500 });
    expect(gramsForSlug(state, "snapper")).toBe(7500);
    expect(gramsForSlug(state, "wahoo")).toBe(0);
  });
});

describe("storage keys", () => {
  it("builds the per-shipment key", () => {
    expect(cartStorageKey("shipment-1")).toBe("cart:v1:shipment-1");
    expect(CART_KEY_PREFIX).toBe("cart:v1:");
  });

  it("round-trips the shipment id from a key and rejects other keys", () => {
    expect(shipmentIdFromKey("cart:v1:shipment-1")).toBe("shipment-1");
    expect(shipmentIdFromKey("cart:v1:")).toBeNull();
    expect(shipmentIdFromKey("other:key")).toBeNull();
    expect(shipmentIdFromKey("cart:v2:shipment-1")).toBeNull();
  });
});

describe("parseStoredCart", () => {
  it("parses a stored cart JSON string", () => {
    const raw = JSON.stringify({ items: [{ slug: "snapper", grams: 7500 }] });
    expect(parseStoredCart(raw)).toEqual({
      items: [{ slug: "snapper", grams: 7500 }],
    });
  });

  it("returns null for null, undefined, garbage JSON and wrong shapes", () => {
    expect(parseStoredCart(null)).toBeNull();
    expect(parseStoredCart(undefined)).toBeNull();
    expect(parseStoredCart("not json")).toBeNull();
    expect(parseStoredCart("42")).toBeNull();
    expect(parseStoredCart("{}")).toBeNull();
    expect(parseStoredCart(JSON.stringify({ items: "nope" }))).toBeNull();
    expect(
      parseStoredCart(JSON.stringify({ items: [{ slug: "snapper", grams: "x" }] })),
    ).toBeNull();
    expect(
      parseStoredCart(JSON.stringify({ items: [{ slug: "", grams: 500 }] })),
    ).toBeNull();
    expect(
      parseStoredCart(JSON.stringify({ items: [{ slug: "snapper", grams: 0 }] })),
    ).toBeNull();
    expect(
      parseStoredCart(JSON.stringify({ items: [{ slug: "snapper" }] })),
    ).toBeNull();
  });

  it("accepts an empty items list and merges duplicate slugs defensively", () => {
    expect(parseStoredCart(JSON.stringify({ items: [] }))).toEqual({ items: [] });
    expect(
      parseStoredCart(
        JSON.stringify({
          items: [
            { slug: "snapper", grams: 7500 },
            { slug: "snapper", grams: 500 },
          ],
        }),
      ),
    ).toEqual({ items: [{ slug: "snapper", grams: 8000 }] });
  });
});

describe("validateQuantityInput", () => {
  const opts = { minGrams: 1000, stepGrams: 500, availableGrams: 25_000 };

  it("accepts valid quantities and returns integer grams", () => {
    expect(validateQuantityInput("7.5", opts)).toEqual({ ok: true, grams: 7500 });
    expect(validateQuantityInput(" 2 ", opts)).toEqual({ ok: true, grams: 2000 });
    expect(validateQuantityInput("1", opts)).toEqual({ ok: true, grams: 1000 });
    expect(validateQuantityInput("25", opts)).toEqual({ ok: true, grams: 25_000 });
    // Sub-kilogram quantities are valid when the species minimum allows them.
    expect(
      validateQuantityInput("0.75", { minGrams: 500, stepGrams: 250, availableGrams: 25_000 }),
    ).toEqual({ ok: true, grams: 750 });
  });

  it("rejects invalid formats with the dot-decimal message", () => {
    const expected = { ok: false, message: "Usa punto para decimales, ej. 7.5" };
    expect(validateQuantityInput("7,5", opts)).toEqual(expected);
    expect(validateQuantityInput("abc", opts)).toEqual(expected);
    expect(validateQuantityInput("", opts)).toEqual(expected);
    expect(validateQuantityInput("1.2345", opts)).toEqual(expected);
    expect(validateQuantityInput("1e2", opts)).toEqual(expected);
    expect(validateQuantityInput("-1", opts)).toEqual(expected);
    expect(validateQuantityInput("1..5", opts)).toEqual(expected);
  });

  it("rejects quantities below the minimum with the minimum message", () => {
    expect(validateQuantityInput("0.3", opts)).toEqual({
      ok: false,
      message: "El pedido mínimo es 1 kg",
    });
    expect(validateQuantityInput("0", opts)).toEqual({
      ok: false,
      message: "El pedido mínimo es 1 kg",
    });
  });

  it("rejects off-step quantities with the step message", () => {
    expect(validateQuantityInput("1.2", opts)).toEqual({
      ok: false,
      message: "Debe ser en pasos de 0.5 kg",
    });
    expect(validateQuantityInput("2.1", opts)).toEqual({
      ok: false,
      message: "Debe ser en pasos de 0.5 kg",
    });
  });

  it("rejects quantities above the available grams with the remaining message", () => {
    expect(validateQuantityInput("25.5", opts)).toEqual({
      ok: false,
      message: "Solo quedan 25 kg",
    });
  });

  it("reports zero availability without formatting zero grams", () => {
    expect(validateQuantityInput("1", { ...opts, availableGrams: 0 })).toEqual({
      ok: false,
      message: "Solo quedan 0 kg",
    });
  });
});
