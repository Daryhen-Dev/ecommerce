// Weight as integer grams. Sold per kilogram with up to three decimals
// (1 g resolution); parsed from digit strings, never through float math.

/** Branded integer weight in grams; always a positive safe integer. */
export type Grams = number & { readonly __brand: "Grams" };

/** Runtime check of the Grams invariant (positive safe integer). */
export function isGrams(value: unknown): value is Grams {
  return (
    typeof value === "number" && Number.isSafeInteger(value) && value > 0
  );
}

/** Constructs branded grams, rejecting zero, negatives, non-integers and unsafe integers. */
export function grams(value: number): Grams {
  if (!Number.isSafeInteger(value)) {
    throw new TypeError(`grams: expected a safe integer, got ${String(value)}`);
  }
  if (value <= 0) {
    throw new RangeError(`grams: weight must be positive, got ${value}`);
  }
  return value as Grams;
}

/**
 * Parses a decimal kilogram string into grams. Accepts only "." as the
 * decimal separator (owner number standard, 2025-10-05) and up to three
 * decimals; surrounding whitespace is trimmed. Digits are handled as strings
 * (no float math). Rejects empty, negative, zero, non-numeric, comma (never
 * a decimal or grouping separator), more than three decimals and exponent
 * notation.
 */
export function parseKilograms(input: string): Grams {
  const trimmed = input.trim();
  const match = /^\d+(?:\.\d{1,3})?$/.exec(trimmed);
  if (match === null) {
    throw new TypeError(
      `parseKilograms: expected a positive decimal kg string with "." as the only decimal separator and at most 3 decimals, got ${JSON.stringify(input)}`,
    );
  }
  const separatorIndex = trimmed.indexOf(".");
  const whole = separatorIndex === -1 ? trimmed : trimmed.slice(0, separatorIndex);
  const fraction = separatorIndex === -1 ? "0" : trimmed.slice(separatorIndex + 1).padEnd(3, "0");
  const total = Number(whole) * 1000 + Number(fraction);
  return grams(total);
}

/**
 * Formats grams as kilograms with "." as the decimal separator (owner number
 * standard) and no trailing zeros, e.g. 7500 -> "7.5 kg", 125 -> "0.125 kg",
 * 8000 -> "8 kg".
 */
export function formatKilograms(value: Grams): string {
  if (!isGrams(value)) {
    throw new TypeError(`formatKilograms: expected positive safe integer grams, got ${String(value)}`);
  }
  const whole = Math.floor(value / 1000);
  const remainder = value % 1000;
  if (remainder === 0) {
    return `${whole} kg`;
  }
  const fraction = String(remainder).padStart(3, "0").replace(/0+$/, "");
  return `${whole}.${fraction} kg`;
}
