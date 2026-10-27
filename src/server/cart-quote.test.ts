// Unit tests for the pure cart quote assembly (no Prisma, no server-only,
// no clock): strict input validation with duplicate merging, per-line
// fulfilment checks against the catalog view models, and server-
// authoritative pricing via priceOrder.

import { describe, expect, it } from "vitest";

import { buildCityCatalog, type CityCatalog } from "./catalog-mapping";
import {
  MAX_CART_LINES,
  buildCartQuote,
  parseQuoteItems,
  type CartItemInput,
} from "./cart-quote";

const AT = new Date("2025-10-15T17:00:00.000Z");
const HOUR = 3_600_000;

const VAT_RATES = { STANDARD: 1500, ZERO_RATED: 0 } as const;

let seq = 0;

function shipmentRow(overrides: { id?: string } = {}) {
  seq += 1;
  const cutoff = new Date(AT.getTime() + 24 * HOUR);
  return {
    id: overrides.id ?? `shipment-${seq}`,
    airportCode: "UIO",
    carrier: "Carga aérea",
    flightNumber: "FL-1",
    orderCutoffAt: cutoff,
    departsAt: new Date(cutoff.getTime() + 14 * HOUR),
    estimatedArrivalAt: new Date(cutoff.getTime() + 16 * HOUR),
    pickupStartsAt: new Date(cutoff.getTime() + 16 * HOUR),
    pickupEndsAt: new Date(cutoff.getTime() + 19 * HOUR),
    status: "SCHEDULED" as const,
  };
}

function speciesRow(overrides: Record<string, unknown> & { id: string; slug: string }) {
  return {
    name: "Especie",
    description: null,
    pricePerKgCents: 1000,
    discountPolicy: "GLOBAL" as const,
    vatCategory: "STANDARD" as const,
    minOrderGrams: 1000,
    orderStepGrams: 500,
    isSeasonal: false,
    active: true,
    ...overrides,
  };
}

function lotRow(speciesId: string, totalGrams: number, reservedGrams = 0) {
  seq += 1;
  return {
    id: `lot-${seq}`,
    speciesId,
    totalGrams,
    reservedGrams,
    status: "OPEN" as const,
  };
}

function tierRow(speciesId: string | null, minTotalGrams: number, discountBps: number) {
  seq += 1;
  return { id: `tier-${seq}`, speciesId, minTotalGrams, discountBps };
}

/**
 * Demo-shaped catalog: Pargo (CUSTOM tiers 0/3kg 3%/8kg 8%), Wahoo (GLOBAL
 * tiers 0/5kg 5%/10kg 10%), Langosta (NONE, out of season) and Corvina
 * (SOLD_OUT: an 800 g remainder below the 1 kg minimum), all in UIO with one
 * orderable shipment.
 */
function demoCatalog(): {
  catalog: CityCatalog;
  shipmentId: string;
  snapperId: string;
  wahooId: string;
  lobsterId: string;
  corvinaId: string;
} {
  seq += 1;
  const shipmentId = `shipment-${seq}`;
  const snapperId = `species-snapper-${seq}`;
  const wahooId = `species-wahoo-${seq}`;
  const lobsterId = `species-lobster-${seq}`;
  const corvinaId = `species-corvina-${seq}`;
  const tunaId = `species-tuna-${seq}`;
  const catalog = buildCityCatalog({
    airport: { code: "UIO", city: "Quito", name: "Aeropuerto Mariscal Sucre", active: true },
    shipments: [shipmentRow({ id: shipmentId })],
    species: [
      speciesRow({
        id: snapperId,
        slug: "snapper",
        name: "Pargo",
        pricePerKgCents: 1200,
        discountPolicy: "CUSTOM",
        minOrderGrams: 1000,
        orderStepGrams: 500,
      }),
      speciesRow({
        id: wahooId,
        slug: "wahoo",
        name: "Wahoo (Guajo)",
        pricePerKgCents: 900,
        discountPolicy: "GLOBAL",
      }),
      speciesRow({
        id: lobsterId,
        slug: "spiny-lobster",
        name: "Langosta espinosa",
        pricePerKgCents: 3800,
        discountPolicy: "NONE",
        minOrderGrams: 500,
        orderStepGrams: 500,
        isSeasonal: true,
      }),
      speciesRow({
        id: corvinaId,
        slug: "corvina",
        name: "Corvina",
        pricePerKgCents: 1300,
        discountPolicy: "GLOBAL",
      }),
      speciesRow({
        id: tunaId,
        slug: "tuna",
        name: "Atún",
        pricePerKgCents: 1100,
        discountPolicy: "GLOBAL",
      }),
    ],
    seasons: [
      // Lobster is OUT of season at AT: the window is entirely in the past.
      {
        speciesId: lobsterId,
        startsAt: new Date(AT.getTime() - 60 * 24 * HOUR),
        endsAt: new Date(AT.getTime() - 30 * 24 * HOUR),
      },
    ],
    lots: [
      lotRow(snapperId, 80_000),
      lotRow(wahooId, 90_000, 30_000),
      lotRow(lobsterId, 25_000),
      // 800 g left: below the 1 kg minimum, so the species is SOLD_OUT.
      lotRow(corvinaId, 800),
      lotRow(tunaId, 200_000),
    ],
    tiers: [
      tierRow(snapperId, 0, 0),
      tierRow(snapperId, 3_000, 300),
      tierRow(snapperId, 8_000, 800),
      tierRow(null, 0, 0),
      tierRow(null, 5_000, 500),
      tierRow(null, 10_000, 1000),
    ],
    at: AT,
  });
  return { catalog, shipmentId, snapperId, wahooId, lobsterId, corvinaId };
}

describe("parseQuoteItems", () => {
  it("accepts a valid items array", () => {
    expect(parseQuoteItems([{ slug: "snapper", grams: 7500 }])).toEqual([
      { slug: "snapper", grams: 7500 },
    ]);
  });

  it("accepts an empty array (the order-level EMPTY_CART error applies later)", () => {
    expect(parseQuoteItems([])).toEqual([]);
  });

  it("merges duplicate slugs by summing their grams", () => {
    expect(
      parseQuoteItems([
        { slug: "snapper", grams: 3000 },
        { slug: "wahoo", grams: 1000 },
        { slug: "snapper", grams: 300 },
      ]),
    ).toEqual([
      { slug: "snapper", grams: 3300 },
      { slug: "wahoo", grams: 1000 },
    ]);
  });

  it("rejects non-array payloads and malformed entries", () => {
    expect(parseQuoteItems("nope")).toBeNull();
    expect(parseQuoteItems(null)).toBeNull();
    expect(parseQuoteItems([null])).toBeNull();
    expect(parseQuoteItems([{ slug: 1, grams: 500 }])).toBeNull();
    expect(parseQuoteItems([{ slug: "snapper" }])).toBeNull();
    expect(parseQuoteItems([{ slug: "snapper", grams: "7500" }])).toBeNull();
  });

  it("rejects slugs outside ^[a-z0-9-]{1,64}$", () => {
    expect(parseQuoteItems([{ slug: "", grams: 500 }])).toBeNull();
    expect(parseQuoteItems([{ slug: "Snapper", grams: 500 }])).toBeNull();
    expect(parseQuoteItems([{ slug: "a b", grams: 500 }])).toBeNull();
    expect(parseQuoteItems([{ slug: "a".repeat(65), grams: 500 }])).toBeNull();
    expect(parseQuoteItems([{ slug: "a".repeat(64), grams: 500 }])).toEqual([
      { slug: "a".repeat(64), grams: 500 },
    ]);
  });

  it("rejects grams that are not positive safe integers", () => {
    expect(parseQuoteItems([{ slug: "snapper", grams: 0 }])).toBeNull();
    expect(parseQuoteItems([{ slug: "snapper", grams: -500 }])).toBeNull();
    expect(parseQuoteItems([{ slug: "snapper", grams: 1.5 }])).toBeNull();
    expect(parseQuoteItems([{ slug: "snapper", grams: Number.MAX_SAFE_INTEGER + 1 }])).toBeNull();
  });

  it("rejects merged grams that overflow the safe integer range", () => {
    const huge = Number.MAX_SAFE_INTEGER;
    expect(
      parseQuoteItems([
        { slug: "snapper", grams: huge },
        { slug: "snapper", grams: 1 },
      ]),
    ).toBeNull();
  });

  it(`rejects more than ${MAX_CART_LINES} lines`, () => {
    const many = Array.from({ length: MAX_CART_LINES + 1 }, (_, i) => ({
      slug: `species-${i}`,
      grams: 1000,
    }));
    expect(parseQuoteItems(many)).toBeNull();
    const exact = Array.from({ length: MAX_CART_LINES }, (_, i) => ({
      slug: `species-${i}`,
      grams: 1000,
    }));
    expect(parseQuoteItems(exact)).toHaveLength(MAX_CART_LINES);
  });
});

describe("buildCartQuote", () => {
  function quoteOf(
    items: CartItemInput[],
    overrides: { requestedShipmentId?: string; catalog?: CityCatalog } = {},
  ) {
    const demo = demoCatalog();
    return buildCartQuote({
      catalog: overrides.catalog ?? demo.catalog,
      requestedShipmentId: overrides.requestedShipmentId ?? demo.shipmentId,
      items,
      vatRatesBps: VAT_RATES,
    });
  }

  it("returns SHIPMENT_CLOSED when the catalog has no orderable shipment", () => {
    const demo = demoCatalog();
    const catalog: CityCatalog = { ...demo.catalog, shipment: null };
    const result = buildCartQuote({
      catalog,
      requestedShipmentId: demo.shipmentId,
      items: [{ slug: "snapper", grams: 7500 }],
      vatRatesBps: VAT_RATES,
    });
    expect(result).toEqual({
      ok: false,
      shipmentId: demo.shipmentId,
      lines: [],
      totals: null,
      orderError: "SHIPMENT_CLOSED",
    });
  });

  it("returns SHIPMENT_CLOSED when the requested shipment is not the current one", () => {
    const demo = demoCatalog();
    const result = buildCartQuote({
      catalog: demo.catalog,
      requestedShipmentId: "shipment-from-an-old-flight",
      items: [{ slug: "snapper", grams: 7500 }],
      vatRatesBps: VAT_RATES,
    });
    expect(result).toEqual({
      ok: false,
      shipmentId: "shipment-from-an-old-flight",
      lines: [],
      totals: null,
      orderError: "SHIPMENT_CLOSED",
    });
  });

  it("returns EMPTY_CART for an empty items list", () => {
    const demo = demoCatalog();
    const result = buildCartQuote({
      catalog: demo.catalog,
      requestedShipmentId: demo.shipmentId,
      items: [],
      vatRatesBps: VAT_RATES,
    });
    expect(result).toEqual({
      ok: false,
      shipmentId: demo.shipmentId,
      lines: [],
      totals: null,
      orderError: "EMPTY_CART",
    });
  });

  it("reports UNKNOWN_SPECIES, OUT_OF_SEASON, BELOW_MINIMUM, OFF_STEP and INSUFFICIENT_AVAILABLE per line", () => {
    const result = quoteOf([
      { slug: "sea-cucumber", grams: 1000 },
      { slug: "spiny-lobster", grams: 1000 },
      { slug: "snapper", grams: 300 },
      { slug: "wahoo", grams: 1200 },
      { slug: "tuna", grams: 300_000 },
    ]);
    if (result.ok) throw new Error("expected a failing result");
    expect(result.orderError).toBeUndefined();
    expect(result.totals).toBeNull();
    expect(result.lines).toEqual([
      { slug: "sea-cucumber", error: "UNKNOWN_SPECIES" },
      { slug: "spiny-lobster", error: "OUT_OF_SEASON" },
      { slug: "snapper", error: "BELOW_MINIMUM" },
      { slug: "wahoo", error: "OFF_STEP" },
      { slug: "tuna", error: "INSUFFICIENT_AVAILABLE", availableGrams: 200_000 },
    ]);
  });

  it("reports INSUFFICIENT_AVAILABLE for a SOLD_OUT species with its remaining grams", () => {
    const result = quoteOf([{ slug: "corvina", grams: 1000 }]);
    if (result.ok) throw new Error("expected a failing result");
    expect(result.lines).toEqual([
      { slug: "corvina", error: "INSUFFICIENT_AVAILABLE", availableGrams: 800 },
    ]);
  });

  it("prices a 7.5 kg Pargo line with its custom tier and 15% VAT", () => {
    const demo = demoCatalog();
    const result = buildCartQuote({
      catalog: demo.catalog,
      requestedShipmentId: demo.shipmentId,
      items: [{ slug: "snapper", grams: 7500 }],
      vatRatesBps: VAT_RATES,
    });
    if (!result.ok) throw new Error("expected ok");
    expect(result).toEqual({
      ok: true,
      shipmentId: demo.shipmentId,
      lines: [
        {
          slug: "snapper",
          name: "Pargo",
          grams: 7500,
          pricePerKgCents: 1200,
          discountBps: 300,
          vatRateBps: 1500,
          grossCents: 9000,
          discountCents: 270,
          vatCents: 1310,
          lineTotalCents: 10040,
        },
      ],
      totals: {
        totalGrams: 7500,
        subtotalCents: 9000,
        discountCents: 270,
        vatCents: 1310,
        totalCents: 10040,
      },
    });
  });

  it("selects the global tier for GLOBAL species by the order total", () => {
    // Wahoo 6 kg: gross 5400; total 6000 g reaches the 5 kg global tier (5%).
    const result = quoteOf([{ slug: "wahoo", grams: 6000 }]);
    if (!result.ok) throw new Error("expected ok");
    expect(result.lines[0]).toMatchObject({
      discountBps: 500,
      grossCents: 5400,
      discountCents: 270,
      vatCents: 770,
      lineTotalCents: 5900,
    });
    expect(result.totals?.totalCents).toBe(5900);
  });

  it("selects tiers per policy from the order's TOTAL grams across lines", () => {
    // Total 7000 g: Pargo (CUSTOM) reaches its 3 kg tier (3%); Wahoo (GLOBAL)
    // reaches the 5 kg global tier (5%).
    const result = quoteOf([
      { slug: "snapper", grams: 3000 },
      { slug: "wahoo", grams: 4000 },
    ]);
    if (!result.ok) throw new Error("expected ok");
    expect(result.totals?.totalGrams).toBe(7000);
    expect(result.lines[0]).toMatchObject({ discountBps: 300, grossCents: 3600 });
    expect(result.lines[1]).toMatchObject({ discountBps: 500, grossCents: 3600 });
  });

  it("merges duplicate slugs into one line before checking and pricing", () => {
    // 3000 g + 500 g of Pargo merge to 3500 g: valid, at the 3 kg tier (3%).
    const result = quoteOf([
      { slug: "snapper", grams: 3000 },
      { slug: "snapper", grams: 500 },
    ]);
    if (!result.ok) throw new Error("expected ok");
    expect(result.lines).toHaveLength(1);
    expect(result.totals?.totalGrams).toBe(3500);
    expect(result.lines[0]).toMatchObject({
      slug: "snapper",
      grams: 3500,
      discountBps: 300,
      grossCents: 4200,
      discountCents: 126,
      vatCents: 611,
      lineTotalCents: 4685,
    });
  });

  it("prices the VALID lines (by their total grams) even when other lines fail, with null totals", () => {
    // Snapper 300 g is BELOW_MINIMUM; wahoo 6000 g is valid and its global
    // tier is selected by the valid-lines total (6000 g -> 5%).
    const result = quoteOf([
      { slug: "snapper", grams: 300 },
      { slug: "wahoo", grams: 6000 },
    ]);
    if (result.ok) throw new Error("expected a failing result");
    expect(result.orderError).toBeUndefined();
    expect(result.totals).toBeNull();
    expect(result.lines).toEqual([
      { slug: "snapper", error: "BELOW_MINIMUM" },
      {
        slug: "wahoo",
        name: "Wahoo (Guajo)",
        grams: 6000,
        pricePerKgCents: 900,
        discountBps: 500,
        vatRateBps: 1500,
        grossCents: 5400,
        discountCents: 270,
        vatCents: 770,
        lineTotalCents: 5900,
      },
    ]);
  });

  it("never mutates its inputs", () => {
    const demo = demoCatalog();
    const items: CartItemInput[] = [
      { slug: "snapper", grams: 7500 },
      { slug: "snapper", grams: 500 },
    ];
    const itemsBefore = JSON.stringify(items);
    buildCartQuote({
      catalog: demo.catalog,
      requestedShipmentId: demo.shipmentId,
      items,
      vatRatesBps: VAT_RATES,
    });
    expect(JSON.stringify(items)).toBe(itemsBefore);
    const snapper = demo.catalog.items.find((item) => item.slug === "snapper");
    expect(snapper?.tiers).toHaveLength(3);
  });
});
