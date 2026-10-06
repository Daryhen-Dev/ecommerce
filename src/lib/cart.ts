// Pure client cart logic: immutable state transitions, the localStorage
// key/value format for per-shipment carts, and the shared quantity input
// validation used by both the catalog add-to-cart forms and the cart page.
//
// No React, no localStorage access and no server imports: the hook and the
// client components own the storage reads, this module only defines the
// shapes and the rules. Prices NEVER live in the cart — only species slugs
// and integer grams.

import { grams, formatKilograms, parseKilograms } from "@/domain/weight";

/** One cart line: a species slug and its weight in integer grams. */
export interface CartItem {
  slug: string;
  grams: number;
}

/** The whole client cart. Serialized to localStorage as { items: [...] }. */
export interface CartState {
  items: CartItem[];
}

/** Slugs follow the same shape the server quote validator accepts. */
const SLUG_PATTERN = /^[a-z0-9-]{1,64}$/;

function assertSlug(slug: string): void {
  if (typeof slug !== "string" || !SLUG_PATTERN.test(slug)) {
    throw new TypeError(`cart: invalid species slug, got ${JSON.stringify(slug)}`);
  }
}

function assertGrams(value: number): void {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new RangeError(`cart: grams must be a positive safe integer, got ${String(value)}`);
  }
}

/** An empty cart. */
export function emptyCart(): CartState {
  return { items: [] };
}

/**
 * Adds `grams` of `slug`, merging into an existing line of the same species
 * (summing grams). Returns a NEW state; the input is never mutated.
 */
export function addItem(state: CartState, slug: string, gramsValue: number): CartState {
  assertSlug(slug);
  assertGrams(gramsValue);
  const existing = state.items.find((item) => item.slug === slug);
  if (existing === undefined) {
    return { items: [...state.items, { slug, grams: gramsValue }] };
  }
  return {
    items: state.items.map((item) =>
      item.slug === slug ? { slug, grams: item.grams + gramsValue } : item,
    ),
  };
}

/**
 * Sets the exact quantity of `slug`, replacing any existing line or appending
 * a new one. Returns a NEW state; the input is never mutated.
 */
export function setItemQuantity(
  state: CartState,
  slug: string,
  gramsValue: number,
): CartState {
  assertSlug(slug);
  assertGrams(gramsValue);
  const existing = state.items.find((item) => item.slug === slug);
  if (existing === undefined) {
    return { items: [...state.items, { slug, grams: gramsValue }] };
  }
  return {
    items: state.items.map((item) =>
      item.slug === slug ? { slug, grams: gramsValue } : item,
    ),
  };
}

/** Removes the line of `slug` (if present). Returns a NEW state. */
export function removeItem(state: CartState, slug: string): CartState {
  return { items: state.items.filter((item) => item.slug !== slug) };
}

/** Removes every line. */
export function clearCart(): CartState {
  return emptyCart();
}

/** Grams currently in the cart for `slug`; 0 when absent. */
export function gramsForSlug(state: CartState, slug: string): number {
  return state.items.find((item) => item.slug === slug)?.grams ?? 0;
}

// --- localStorage format ---

export const CART_KEY_PREFIX = "cart:v1:";

/** The localStorage key of the cart for one shipment: `cart:v1:{shipmentId}`. */
export function cartStorageKey(shipmentId: string): string {
  return `${CART_KEY_PREFIX}${shipmentId}`;
}

/** The shipment id encoded in a cart key, or null for any other key. */
export function shipmentIdFromKey(key: string): string | null {
  if (typeof key !== "string" || !key.startsWith(CART_KEY_PREFIX)) {
    return null;
  }
  const shipmentId = key.slice(CART_KEY_PREFIX.length);
  return shipmentId.length > 0 ? shipmentId : null;
}

/**
 * Parses a stored cart value. Returns null for anything that is not a valid
 * stored cart (bad JSON, wrong shapes, invalid grams); duplicate slugs are
 * merged defensively. An empty items list is a valid empty cart.
 */
export function parseStoredCart(raw: string | null | undefined): CartState | null {
  if (raw === null || raw === undefined) {
    return null;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof parsed !== "object" || parsed === null || !Array.isArray((parsed as CartState).items)) {
    return null;
  }
  const items: CartItem[] = [];
  for (const rawItem of (parsed as CartState).items) {
    if (typeof rawItem !== "object" || rawItem === null) {
      return null;
    }
    const { slug, grams: gramsValue } = rawItem as CartItem;
    if (typeof slug !== "string" || !SLUG_PATTERN.test(slug)) {
      return null;
    }
    if (!Number.isSafeInteger(gramsValue) || gramsValue <= 0) {
      return null;
    }
    const existing = items.find((item) => item.slug === slug);
    if (existing === undefined) {
      items.push({ slug, grams: gramsValue });
    } else {
      existing.grams += gramsValue;
    }
  }
  return { items };
}

// --- quantity input validation (shared client rule) ---

export const QUANTITY_FORMAT_MESSAGE = "Usa punto para decimales, ej. 7.5";

export type QuantityValidation =
  | { ok: true; grams: number }
  | { ok: false; message: string };

/**
 * Validates a raw quantity text input against the species rules: "." decimals
 * only and up to three decimals (parseKilograms), per-species minimum and
 * step, and never above the available grams. Error messages are the exact
 * Spanish strings shown next to the inputs.
 *
 * `availableGrams` is the maximum the user may enter here: for the catalog
 * add form that is the remaining stock minus what is already in the cart;
 * for the cart page it is the full available grams (the line is replaced).
 */
export function validateQuantityInput(
  input: string,
  opts: { minGrams: number; stepGrams: number; availableGrams: number },
): QuantityValidation {
  const trimmed = input.trim();
  if (!/^\d+(?:\.\d{1,3})?$/.test(trimmed)) {
    return { ok: false, message: QUANTITY_FORMAT_MESSAGE };
  }
  // parseKilograms rejects zero through `grams`; zero is a below-minimum
  // quantity, not a format error, so it is handled before parsing.
  if (/^0+(?:\.0+)?$/.test(trimmed)) {
    return {
      ok: false,
      message: `El pedido mínimo es ${formatKilograms(grams(opts.minGrams))}`,
    };
  }
  const gramsValue = parseKilograms(trimmed);
  if (gramsValue < opts.minGrams) {
    return {
      ok: false,
      message: `El pedido mínimo es ${formatKilograms(grams(opts.minGrams))}`,
    };
  }
  if ((gramsValue - opts.minGrams) % opts.stepGrams !== 0) {
    return {
      ok: false,
      message: `Debe ser en pasos de ${formatKilograms(grams(opts.stepGrams))}`,
    };
  }
  if (gramsValue > opts.availableGrams) {
    const remaining =
      opts.availableGrams > 0
        ? formatKilograms(grams(opts.availableGrams))
        : "0 kg";
    return { ok: false, message: `Solo quedan ${remaining}` };
  }
  return { ok: true, grams: gramsValue };
}
