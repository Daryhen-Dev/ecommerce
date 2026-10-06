// Pure cart quote assembly: validates the raw cart items coming from the
// browser, checks every line against the city catalog view models (species
// available, per-species minimum/step, available grams) and prices the whole
// cart through the domain `priceOrder`. The result is the ONLY source of
// prices for the cart page: nothing from the client is ever trusted.
//
// No Prisma, no `server-only`, no clock access: the catalog and the VAT
// rates (already resolved at the request instant) are parameters.

import { canFulfillOrder, type LotState } from "../domain/lot";
import { grams as gramsBrand } from "../domain/weight";
import { cents } from "../domain/money";
import {
  priceOrder,
  type DiscountPolicy,
  type PricedLine,
  type VatCategory,
} from "../domain/pricing";

import type { CityCatalog } from "./catalog-mapping";

/** Hard upper bound of lines per cart quote request. */
export const MAX_CART_LINES = 20;

const SLUG_PATTERN = /^[a-z0-9-]{1,64}$/;

/** One cart line as sent by the browser: species slug + integer grams. */
export interface CartItemInput {
  slug: string;
  grams: number;
}

/** Line-level error codes, rendered as Spanish messages in the UI. */
export type CartLineErrorCode =
  | "UNKNOWN_SPECIES"
  | "OUT_OF_SEASON"
  | "BELOW_MINIMUM"
  | "OFF_STEP"
  | "INSUFFICIENT_AVAILABLE";

/** A line that cannot be ordered; it is excluded from pricing. */
export interface CartQuoteErrorLine {
  slug: string;
  error: CartLineErrorCode;
  /** Stock left for the species; present for INSUFFICIENT_AVAILABLE. */
  availableGrams?: number;
}

/** A quoted line: the public `priceOrder` fields plus the species slug and name. */
export interface CartQuotePricedLine {
  slug: string;
  name: string;
  grams: number;
  pricePerKgCents: number;
  discountBps: number;
  vatRateBps: number;
  grossCents: number;
  discountCents: number;
  vatCents: number;
  lineTotalCents: number;
}

export type CartQuoteLine = CartQuotePricedLine | CartQuoteErrorLine;

export interface CartQuoteTotals {
  totalGrams: number;
  subtotalCents: number;
  discountCents: number;
  vatCents: number;
  totalCents: number;
}

/** Order-level error codes. INVALID_INPUT is defensive: malformed payloads
 * never come from our own UI. */
export type CartOrderErrorCode = "SHIPMENT_CLOSED" | "EMPTY_CART" | "INVALID_INPUT";

export interface CartQuoteResult {
  /**
   * True only when EVERY line is priced and `totals` is computed. When some
   * lines fail, the valid lines are still priced (their per-line data is
   * returned) but `totals` is null: showing a total that excludes lines the
   * customer is about to fix would be misleading.
   */
  ok: boolean;
  shipmentId: string;
  lines: CartQuoteLine[];
  totals: CartQuoteTotals | null;
  orderError?: CartOrderErrorCode;
}

function isPositiveSafeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0;
}

/**
 * Strict manual validation of the raw items payload (zod is not installed):
 * an array of at most 20 entries, each `{ slug, grams }` with a slug matching
 * `^[a-z0-9-]{1,64}$` and grams a positive safe integer. Duplicate slugs are
 * merged by summing their grams (an overflow of the safe integer range
 * rejects the payload). Unknown keys are ignored. Returns null when the
 * payload is malformed; an empty array is valid and yields the order-level
 * EMPTY_CART error downstream.
 */
export function parseQuoteItems(raw: unknown): CartItemInput[] | null {
  if (!Array.isArray(raw) || raw.length > MAX_CART_LINES) {
    return null;
  }
  const merged = new Map<string, number>();
  for (const entry of raw) {
    if (typeof entry !== "object" || entry === null) {
      return null;
    }
    const { slug, grams: gramsValue } = entry as Partial<CartItemInput>;
    if (typeof slug !== "string" || !SLUG_PATTERN.test(slug)) {
      return null;
    }
    if (!isPositiveSafeInteger(gramsValue)) {
      return null;
    }
    const sum = (merged.get(slug) ?? 0) + gramsValue;
    if (!Number.isSafeInteger(sum)) {
      return null;
    }
    merged.set(slug, sum);
  }
  return [...merged].map(([slug, grams]) => ({ slug, grams }));
}

function errorLineOf(
  slug: string,
  error: CartLineErrorCode,
  availableGrams?: number,
): CartQuoteErrorLine {
  return availableGrams === undefined ? { slug, error } : { slug, error, availableGrams };
}

/**
 * Defensive duplicate merge (the Server Action already merges through
 * `parseQuoteItems`): same-slug lines are summed, first-appearance order kept.
 */
function mergeItems(items: CartItemInput[]): CartItemInput[] {
  const merged = new Map<string, number>();
  for (const item of items) {
    merged.set(item.slug, (merged.get(item.slug) ?? 0) + item.grams);
  }
  return [...merged].map(([slug, grams]) => ({ slug, grams }));
}

/** Public priced line: the priceOrder output fields plus slug/name, without
 * the internal speciesId (the slug is the line key the UI sees). */
function toPricedLine(
  line: PricedLine,
  slug: string,
  name: string,
): CartQuotePricedLine {
  return {
    slug,
    name,
    grams: line.grams,
    pricePerKgCents: line.pricePerKgCents,
    discountBps: line.discountBps,
    vatRateBps: line.vatRateBps,
    grossCents: line.grossCents,
    discountCents: line.discountCents,
    vatCents: line.vatCents,
    lineTotalCents: line.lineTotalCents,
  };
}

/**
 * Quotes the cart against the catalog. Every line must reference a species
 * that exists and is AVAILABLE, pass the per-species minimum/step rule and
 * fit within the available grams; failing lines come back as error lines and
 * the remaining VALID lines are priced together (their discount tiers are
 * selected by the total grams of the valid lines). The requested shipment id
 * must be the catalog's current orderable one.
 */
export function buildCartQuote(input: {
  catalog: CityCatalog;
  requestedShipmentId: string;
  items: CartItemInput[];
  vatRatesBps: Record<VatCategory, number>;
}): CartQuoteResult {
  const { catalog, requestedShipmentId, items, vatRatesBps } = input;

  const shipment = catalog.shipment;
  if (shipment === null || shipment.id !== requestedShipmentId) {
    return {
      ok: false,
      shipmentId: requestedShipmentId,
      lines: [],
      totals: null,
      orderError: "SHIPMENT_CLOSED",
    };
  }
  if (items.length === 0) {
    return {
      ok: false,
      shipmentId: requestedShipmentId,
      lines: [],
      totals: null,
      orderError: "EMPTY_CART",
    };
  }

  const itemsBySlug = new Map(catalog.items.map((item) => [item.slug, item]));
  const requestItems = mergeItems(items);

  const quotable: { index: number; slug: string; grams: number; item: (typeof catalog.items)[number] }[] = [];
  const errorLines = new Map<number, CartQuoteErrorLine>();
  for (const [index, cartItem] of requestItems.entries()) {
    const item = itemsBySlug.get(cartItem.slug);
    if (item === undefined) {
      errorLines.set(index, errorLineOf(cartItem.slug, "UNKNOWN_SPECIES"));
      continue;
    }
    if (item.availability.state === "OUT_OF_SEASON") {
      errorLines.set(index, errorLineOf(cartItem.slug, "OUT_OF_SEASON"));
      continue;
    }
    if (item.availability.state === "SOLD_OUT") {
      // The remainder (possibly 0) is below the species minimum: nothing
      // orderable is left, which is an availability problem.
      errorLines.set(
        index,
        errorLineOf(cartItem.slug, "INSUFFICIENT_AVAILABLE", item.availability.availableGrams),
      );
      continue;
    }
    // canFulfillOrder against a synthetic OPEN lot holding exactly the
    // available grams reuses the domain min/step/availability rule.
    const syntheticLot: LotState = {
      totalGrams: item.availability.availableGrams,
      reservedGrams: 0,
      status: "OPEN",
    };
    const rejection = canFulfillOrder(syntheticLot, cartItem.grams, {
      minOrderGrams: item.minOrderGrams,
      orderStepGrams: item.orderStepGrams,
    });
    if (rejection !== true) {
      const issue: CartLineErrorCode =
        rejection === "INSUFFICIENT_AVAILABLE"
          ? "INSUFFICIENT_AVAILABLE"
          : rejection === "BELOW_MINIMUM"
            ? "BELOW_MINIMUM"
            : rejection === "OFF_STEP"
              ? "OFF_STEP"
              // "CLOSED"/"INVALID" cannot occur on a synthetic OPEN lot with
              // a validated amount; map them defensively to UNKNOWN_SPECIES.
              : "UNKNOWN_SPECIES";
      errorLines.set(
        index,
        issue === "INSUFFICIENT_AVAILABLE"
          ? errorLineOf(cartItem.slug, issue, item.availability.availableGrams)
          : errorLineOf(cartItem.slug, issue),
      );
      continue;
    }
    quotable.push({ index, slug: cartItem.slug, grams: cartItem.grams, item });
  }

  // Priced lines keyed by request index so the output keeps request order.
  const pricedByIndex = new Map<number, CartQuotePricedLine>();
  if (quotable.length > 0) {
    // The mapping already resolved each species' EFFECTIVE tiers (global for
    // GLOBAL policy, its own for CUSTOM, empty for NONE). priceOrder needs the
    // global tier set at order level: any GLOBAL line's tiers are exactly that.
    const globalTiers =
      quotable.find(({ item }) => item.discountPolicy === "GLOBAL")?.item.tiers ?? [];

    priceOrder({
      lines: quotable.map(({ slug, grams: gramsValue, item }) => ({
        // The slug is the unique line key priceOrder sees; prices and
        // policies always come from the server catalog, never the client.
        speciesId: slug,
        grams: gramsBrand(gramsValue),
        pricePerKgCents: cents(item.pricePerKgCents),
        discountPolicy: item.discountPolicy as DiscountPolicy,
        customTiers: item.discountPolicy === "CUSTOM" ? item.tiers : undefined,
        vatCategory: item.vatCategory,
      })),
      globalTiers,
      vatRatesBps,
    }).lines.forEach((line: PricedLine, index: number) => {
      pricedByIndex.set(quotable[index].index, toPricedLine(line, quotable[index].slug, quotable[index].item.name));
    });
  }

  if (errorLines.size > 0) {
    return {
      ok: false,
      shipmentId: requestedShipmentId,
      lines: requestItems.map(
        (_, index) => pricedByIndex.get(index) ?? errorLines.get(index)!,
      ),
      totals: null,
    };
  }

  // No error lines means every request line was quotable and priced.
  const pricedLines = requestItems.map((_, index) => pricedByIndex.get(index)!);
  return {
    ok: true,
    shipmentId: shipment.id,
    lines: pricedLines,
    totals: {
      totalGrams: pricedLines.reduce((acc, line) => acc + line.grams, 0),
      subtotalCents: pricedLines.reduce((acc, line) => acc + line.grossCents, 0),
      discountCents: pricedLines.reduce((acc, line) => acc + line.discountCents, 0),
      vatCents: pricedLines.reduce((acc, line) => acc + line.vatCents, 0),
      totalCents: pricedLines.reduce((acc, line) => acc + line.lineTotalCents, 0),
    },
  };
}
