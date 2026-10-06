// VAT-rate resolution: given effective-dated tax rates (append-only history,
// one row per (category, effectiveFrom)), resolve the rate in effect for each
// category at a given instant. Pure domain: no framework, database, I/O or
// clock access; the instant is a parameter; inputs are never mutated.

import type { VatCategory } from "./pricing";

export type TaxErrorCode =
  | "NO_RATE_IN_EFFECT"
  | "INVALID_RATE"
  | "DUPLICATE_RATE"
  | "INVALID_INSTANT";

export class TaxError extends Error {
  readonly code: TaxErrorCode;

  constructor(code: TaxErrorCode, message: string) {
    super(message);
    this.name = "TaxError";
    this.code = code;
  }
}

/** One row of the append-only tax-rate history. */
export interface DatedVatRate {
  category: VatCategory;
  rateBps: number;
  effectiveFrom: Date;
}

const VAT_CATEGORIES: readonly VatCategory[] = ["STANDARD", "ZERO_RATED"];

function isValidDate(value: unknown): value is Date {
  return value instanceof Date && !Number.isNaN(value.getTime());
}

function isValidRateBps(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 && value <= 10000;
}

/**
 * For each VAT category, returns the rate of the row with the greatest
 * `effectiveFrom <= at`. Throws when a category has no rate in effect at
 * `at`, when any bps value is invalid, or when the history contains
 * duplicate (category, effectiveFrom) pairs.
 */
export function resolveVatRates(rates: DatedVatRate[], at: Date): Record<VatCategory, number> {
  if (!isValidDate(at)) {
    throw new TaxError("INVALID_INSTANT", `at must be a valid Date, got ${String(at)}`);
  }

  if (!Array.isArray(rates)) {
    throw new TaxError("INVALID_RATE", "rates must be an array");
  }

  const seen = new Set<string>();
  for (const [index, raw] of rates.entries()) {
    const where = `rates[${index}]`;
    if (
      typeof raw !== "object" ||
      raw === null ||
      !VAT_CATEGORIES.includes(raw.category) ||
      !isValidDate(raw.effectiveFrom)
    ) {
      throw new TaxError("INVALID_RATE", `${where}: malformed rate entry`);
    }
    if (!isValidRateBps(raw.rateBps)) {
      throw new TaxError("INVALID_RATE", `${where}: rateBps must be an integer in 0..10000, got ${String(raw.rateBps)}`);
    }
    const key = `${raw.category}@${raw.effectiveFrom.getTime()}`;
    if (seen.has(key)) {
      throw new TaxError("DUPLICATE_RATE", `${where}: duplicate entry for category ${raw.category} at ${raw.effectiveFrom.toISOString()}`);
    }
    seen.add(key);
  }

  // Greatest effectiveFrom <= at, per category; entries are never mutated or
  // reordered, and the result is a fresh object.
  const resolved = {} as Record<VatCategory, number>;
  for (const category of VAT_CATEGORIES) {
    let best: DatedVatRate | undefined;
    for (const rate of rates) {
      if (rate.category !== category) continue;
      if (rate.effectiveFrom.getTime() > at.getTime()) continue;
      if (best === undefined || rate.effectiveFrom.getTime() > best.effectiveFrom.getTime()) {
        best = rate;
      }
    }
    if (best === undefined) {
      throw new TaxError("NO_RATE_IN_EFFECT", `no ${category} VAT rate in effect at ${at.toISOString()}`);
    }
    resolved[category] = best.rateBps;
  }
  return resolved;
}
