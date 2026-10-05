// Money as integer US cents. Ecuador uses USD; no floating-point arithmetic
// is ever applied to monetary amounts.

/**
 * Branded integer amount of US cents. Branding is compile-time only, so the
 * runtime guards below enforce the numeric invariant instead: a Cents value
 * is always a non-negative safe integer.
 */
export type Cents = number & { readonly __brand: "Cents" };

/** Runtime check of the Cents invariant (non-negative safe integer). */
export function isCents(value: unknown): value is Cents {
  return (
    typeof value === "number" && Number.isSafeInteger(value) && value >= 0
  );
}

/** Constructs branded cents, rejecting non-integers, negatives and unsafe integers. */
export function cents(value: number): Cents {
  if (!Number.isSafeInteger(value)) {
    throw new TypeError(`cents: expected a safe integer, got ${String(value)}`);
  }
  if (value < 0) {
    throw new RangeError(`cents: negative amounts are not allowed, got ${value}`);
  }
  return value as Cents;
}

/**
 * Percentage of an amount in basis points, rounded half up using integer
 * arithmetic only: floor((amount * bps + 5000) / 10000). No float
 * multiplication of money ever happens.
 */
export function percentOf(amount: Cents, bps: number): Cents {
  if (!Number.isSafeInteger(bps) || bps < 0 || bps > 10000) {
    throw new RangeError(`percentOf: bps must be an integer in 0..10000, got ${String(bps)}`);
  }
  if (!isCents(amount)) {
    throw new TypeError(`percentOf: expected non-negative safe integer cents, got ${String(amount)}`);
  }
  return Math.floor((amount * bps + 5000) / 10000) as Cents;
}

const usdFormatter = new Intl.NumberFormat("es-EC", {
  style: "currency",
  currency: "USD",
});

/** Formats cents as USD in es-EC style, e.g. 1250 -> "$12,50". */
export function formatUsd(value: Cents): string {
  if (!isCents(value)) {
    throw new TypeError(`formatUsd: expected non-negative safe integer cents, got ${String(value)}`);
  }
  return usdFormatter.format(value / 100);
}
