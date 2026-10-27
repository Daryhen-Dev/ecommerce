// Cart quote Server Action. The ONLY pricing endpoint for the cart page:
// the browser sends species slugs and grams, everything else (prices,
// discounts, VAT) is computed here from the database, never trusted from
// the client.
//
// Thin on purpose: strict input validation, per-line checks and quote
// assembly live in ./cart-quote (pure, unit-tested); this module only
// loads the catalog and the effective VAT rates and wires them together.

"use server";

import "server-only";

import { resolveVatRates } from "@/domain/tax";

import { db } from "@/lib/db";

import { buildCartQuote, parseQuoteItems } from "./cart-quote";
import { getCityCatalog } from "./catalog";

import type { CartQuoteResult } from "./cart-quote";

export type {
  CartQuoteResult,
  CartQuoteLine,
  CartQuoteErrorLine,
  CartQuotePricedLine,
  CartQuoteTotals,
  CartLineErrorCode,
  CartOrderErrorCode,
} from "./cart-quote";

/**
 * Re-quotes the given cart lines against the current orderable shipment of
 * `airportCode`. Failures are returned as data (never thrown) so the cart
 * UI can react: SHIPMENT_CLOSED for a stale cart, per-line error codes on
 * each line, EMPTY_CART / INVALID_INPUT for degenerate payloads.
 */
export async function quoteCart(
  airportCode: string,
  shipmentId: string,
  items: { slug: string; grams: number }[],
): Promise<CartQuoteResult> {
  const parsedItems = parseQuoteItems(items);
  if (parsedItems === null) {
    // Malformed payloads never come from our own UI; there is no meaningful
    // quote to return.
    return { ok: false, shipmentId, lines: [], totals: null, orderError: "INVALID_INPUT" };
  }

  // ONE request instant for every rule below (orderability, season, VAT):
  // the catalog and the tax rates must agree on the same clock reading.
  const at = new Date();
  const catalog = await getCityCatalog(airportCode, at);
  if (catalog === null) {
    // Unknown or inactive airport: there is no orderable shipment here.
    return { ok: false, shipmentId, lines: [], totals: null, orderError: "SHIPMENT_CLOSED" };
  }

  const taxRateRows = await db.taxRate.findMany({
    select: { category: true, rateBps: true, effectiveFrom: true },
  });
  // No rate in effect is a server configuration problem: let the TaxError
  // reject the action; the cart UI shows a generic retry message.
  const vatRatesBps = resolveVatRates(taxRateRows, at);

  return buildCartQuote({
    catalog,
    requestedShipmentId: shipmentId,
    items: parsedItems,
    vatRatesBps,
  });
}
