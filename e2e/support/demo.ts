// Demo constants shared by the E2E specs. They mirror prisma/seed-demo.ts
// (species, lots, custom tiers) and prisma/seed.ts (global tiers, VAT) so a
// re-seed does not silently break assertions: update this file when the demo
// seed changes.
//
// Expected totals are computed with the same integer formulas the domain
// uses (round half up), never hardcoded guesses.

export const VAT_BPS = 1500;

export const FLIGHT_NUMBERS = {
  UIO: "DEMO-UIO-1",
  GYE: "DEMO-GYE-1",
  CUE: "DEMO-CUE-1",
} as const;

export interface DemoSpecies {
  slug: string;
  name: string;
  pricePerKgCents: number;
  /** Sum of OPEN lots (total - reserved) in the demo seed. */
  availableGrams: number;
  minOrderGrams: number;
  orderStepGrams: number;
}

export const SPECIES = {
  wahoo: {
    slug: "wahoo",
    name: "Wahoo (Guajo)",
    pricePerKgCents: 900,
    // 120,000 open - 30,000 reserved.
    availableGrams: 90_000,
    minOrderGrams: 1000,
    orderStepGrams: 500,
  },
  tuna: {
    slug: "yellowfin-tuna",
    name: "Atún aleta amarilla",
    pricePerKgCents: 1100,
    // Closed 50,000 lot does not count; open lot is fully free.
    availableGrams: 200_000,
    minOrderGrams: 1000,
    orderStepGrams: 500,
  },
  grouper: {
    slug: "grouper",
    name: "Bacalao de Galápagos",
    pricePerKgCents: 1400,
    availableGrams: 60_000,
    minOrderGrams: 1000,
    orderStepGrams: 500,
  },
  snapper: {
    slug: "snapper",
    name: "Pargo",
    pricePerKgCents: 1200,
    availableGrams: 80_000,
    minOrderGrams: 1000,
    orderStepGrams: 500,
  },
  lobster: {
    slug: "spiny-lobster",
    name: "Langosta espinosa",
    pricePerKgCents: 3800,
    availableGrams: 25_000,
    minOrderGrams: 500,
    orderStepGrams: 500,
  },
  // Seasonal and OUT of season in the demo (next season in ~40 days): the
  // card renders without an add-to-cart form and a tampered cart line is
  // rejected by the server quote. availableGrams reflects its open lot but
  // is never orderable.
  mahiMahi: {
    slug: "mahi-mahi",
    name: "Dorado",
    pricePerKgCents: 1000,
    availableGrams: 40_000,
    minOrderGrams: 1000,
    orderStepGrams: 500,
  },
} satisfies Record<string, DemoSpecies>;

/** Pargo CUSTOM volume tiers (selected by the cart's TOTAL grams). */
export const SNAPPER_TIERS: [number, number][] = [
  [0, 0],
  [3000, 300],
  [8000, 800],
];

/** Global volume tiers applied to GLOBAL-policy species (tuna, wahoo, ...). */
export const TUNA_TIERS: [number, number][] = [
  [0, 0],
  [5000, 500],
  [10000, 1000],
];

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

export function formatUsd(cents: number): string {
  const whole = Math.floor(cents / 100);
  const fraction = String(cents % 100).padStart(2, "0");
  const grouped = String(whole).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return `$${grouped}.${fraction}`;
}

/** Kilogram display text for a grams amount: 80_000 -> "80 kg". */
export function kgText(grams: number): string {
  const kg = grams / 1000;
  return `${Number.isInteger(kg) ? kg : kg.toFixed(1)} kg`;
}

export interface LineQuote {
  gross: number;
  discount: number;
  vat: number;
  total: number;
}

/** Expected per-line quote: tiers are selected by the cart's TOTAL grams. */
export function lineQuoteOf(
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
export function totalsOf(
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
