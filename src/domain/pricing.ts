// Order pricing: per-kilogram line pricing, volume discount tiers selected by
// the order's total weight across species, and VAT by configurable category.
// Pure domain: no framework, database, I/O or clock access; inputs are never
// mutated; every monetary result is an integer amount of US cents.

import { cents, percentOf, type Cents } from "./money";
import type { Grams } from "./weight";

export type DiscountPolicy = "GLOBAL" | "CUSTOM" | "NONE";
export type VatCategory = "STANDARD" | "ZERO_RATED";

export interface DiscountTier {
  minTotalGrams: number;
  discountBps: number;
}

export interface PricingLineInput {
  speciesId: string;
  grams: Grams;
  pricePerKgCents: Cents;
  discountPolicy: DiscountPolicy;
  /** Required (non-empty) when discountPolicy is CUSTOM; replaces the global tiers for this line. */
  customTiers?: DiscountTier[];
  vatCategory: VatCategory;
}

export interface PricingInput {
  lines: PricingLineInput[];
  globalTiers: DiscountTier[];
  /** Supplied by configuration (effective-dated elsewhere); never hardcoded in the domain. */
  vatRatesBps: Record<VatCategory, number>;
}

export interface PricedLine {
  speciesId: string;
  grams: Grams;
  pricePerKgCents: Cents;
  discountBps: number;
  vatRateBps: number;
  grossCents: Cents;
  discountCents: Cents;
  vatCents: Cents;
  lineTotalCents: Cents;
}

/** The locked quote to persist at payment time. */
export interface PricedOrder {
  totalGrams: number;
  subtotalCents: Cents;
  discountCents: Cents;
  vatCents: Cents;
  totalCents: Cents;
  lines: PricedLine[];
}

export type PricingErrorCode =
  | "EMPTY_LINES"
  | "INVALID_LINE"
  | "CUSTOM_TIERS_REQUIRED"
  | "INVALID_TIER"
  | "DUPLICATE_TIER_THRESHOLD"
  | "DUPLICATE_SPECIES"
  | "INVALID_VAT_RATE";

export class PricingError extends Error {
  readonly code: PricingErrorCode;

  constructor(code: PricingErrorCode, message: string) {
    super(message);
    this.name = "PricingError";
    this.code = code;
  }
}

const DISCOUNT_POLICIES: readonly DiscountPolicy[] = ["GLOBAL", "CUSTOM", "NONE"];
const VAT_CATEGORIES: readonly VatCategory[] = ["STANDARD", "ZERO_RATED"];

function isNonNegativeSafeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

/** Validates one tier set in place-free fashion; returns tiers sorted by threshold (copy). */
function validateTierSet(tiers: unknown, where: string): DiscountTier[] {
  if (!Array.isArray(tiers)) {
    throw new PricingError("INVALID_TIER", `${where}: tiers must be an array`);
  }
  const seen = new Set<number>();
  for (const tier of tiers) {
    const { minTotalGrams, discountBps } = tier as DiscountTier;
    if (!isNonNegativeSafeInteger(minTotalGrams)) {
      throw new PricingError("INVALID_TIER", `${where}: minTotalGrams must be a non-negative safe integer, got ${String(minTotalGrams)}`);
    }
    if (!Number.isSafeInteger(discountBps) || discountBps < 0 || discountBps > 10000) {
      throw new PricingError("INVALID_TIER", `${where}: discountBps must be an integer in 0..10000, got ${String(discountBps)}`);
    }
    if (seen.has(minTotalGrams)) {
      throw new PricingError("DUPLICATE_TIER_THRESHOLD", `${where}: duplicate minTotalGrams ${minTotalGrams}`);
    }
    seen.add(minTotalGrams);
  }
  // Copy sorted by threshold; the caller's array is never mutated.
  return [...tiers].sort((a, b) => a.minTotalGrams - b.minTotalGrams);
}

/** Highest tier with minTotalGrams <= totalGrams; 0 bps when none matches. */
function selectBps(sortedTiers: DiscountTier[], totalGrams: number): number {
  let selected = 0;
  for (const tier of sortedTiers) {
    if (tier.minTotalGrams <= totalGrams) {
      selected = tier.discountBps;
    } else {
      break;
    }
  }
  return selected;
}

/**
 * gross = round_half_up(grams * pricePerKgCents / 1000), integer arithmetic
 * only: floor((grams * pricePerKgCents + 500) / 1000).
 */
function grossOf(gramsValue: Grams, pricePerKgCents: Cents): Cents {
  return Math.floor((gramsValue * pricePerKgCents + 500) / 1000) as Cents;
}

export function priceOrder(input: PricingInput): PricedOrder {
  const { lines, globalTiers, vatRatesBps } = input;

  if (!Array.isArray(lines) || lines.length === 0) {
    throw new PricingError("EMPTY_LINES", "an order needs at least one line");
  }

  // --- per-line validation (input order); sorted custom tiers are cached per line ---
  const sortedCustomTiers = new Map<number, DiscountTier[]>();
  for (const [index, raw] of lines.entries()) {
    const where = `lines[${index}]`;
    if (
      typeof raw !== "object" ||
      raw === null ||
      typeof raw.speciesId !== "string" ||
      raw.speciesId.length === 0 ||
      !isNonNegativeSafeInteger(raw.grams) ||
      raw.grams <= 0 ||
      !isNonNegativeSafeInteger(raw.pricePerKgCents) ||
      !DISCOUNT_POLICIES.includes(raw.discountPolicy) ||
      !VAT_CATEGORIES.includes(raw.vatCategory)
    ) {
      throw new PricingError("INVALID_LINE", `${where}: malformed line input`);
    }
    if (raw.discountPolicy === "CUSTOM") {
      if (!Array.isArray(raw.customTiers) || raw.customTiers.length === 0) {
        throw new PricingError("CUSTOM_TIERS_REQUIRED", `${where}: policy CUSTOM requires a non-empty customTiers list`);
      }
      sortedCustomTiers.set(index, validateTierSet(raw.customTiers, `${where}.customTiers`));
    }
  }

  // --- duplicate species (caller must merge lines of the same species) ---
  const seenSpecies = new Set<string>();
  for (const [index, raw] of lines.entries()) {
    if (seenSpecies.has(raw.speciesId)) {
      throw new PricingError("DUPLICATE_SPECIES", `lines[${index}]: species "${raw.speciesId}" appears more than once; merge its lines first`);
    }
    seenSpecies.add(raw.speciesId);
  }

  // --- global tiers and VAT rates ---
  const sortedGlobalTiers = validateTierSet(globalTiers, "globalTiers");
  const usedCategories = new Set<VatCategory>(lines.map((l) => l.vatCategory));
  for (const category of VAT_CATEGORIES) {
    if (!usedCategories.has(category)) continue;
    const rate = vatRatesBps[category];
    if (!Number.isSafeInteger(rate) || rate < 0 || rate > 10000) {
      throw new PricingError("INVALID_VAT_RATE", `vatRatesBps: missing or invalid rate for category ${category}, got ${String(rate)}`);
    }
  }

  // --- pricing ---
  const totalGrams = lines.reduce((acc, l) => acc + (l.grams as number), 0);

  let subtotalCents = 0;
  let discountTotalCents = 0;
  let vatTotalCents = 0;

  const pricedLines: PricedLine[] = lines.map((raw, index) => {
    const sortedTiers =
      raw.discountPolicy === "GLOBAL"
        ? sortedGlobalTiers
        : raw.discountPolicy === "CUSTOM"
          ? (sortedCustomTiers.get(index) ?? [])
          : [];
    const discountBps =
      raw.discountPolicy === "NONE" ? 0 : selectBps(sortedTiers, totalGrams);
    const vatRateBps = vatRatesBps[raw.vatCategory];

    const grossCents = grossOf(raw.grams, raw.pricePerKgCents);
    const discountCents = percentOf(grossCents, discountBps);
    const netCents = cents(grossCents - discountCents);
    const vatCents = percentOf(netCents, vatRateBps);
    const lineTotalCents = cents(netCents + vatCents);

    subtotalCents += grossCents;
    discountTotalCents += discountCents;
    vatTotalCents += vatCents;

    return {
      speciesId: raw.speciesId,
      grams: raw.grams,
      pricePerKgCents: raw.pricePerKgCents,
      discountBps,
      vatRateBps,
      grossCents,
      discountCents,
      vatCents,
      lineTotalCents,
    };
  });

  return {
    totalGrams,
    subtotalCents: cents(subtotalCents),
    discountCents: cents(discountTotalCents),
    vatCents: cents(vatTotalCents),
    totalCents: cents(subtotalCents - discountTotalCents + vatTotalCents),
    lines: pricedLines,
  };
}
