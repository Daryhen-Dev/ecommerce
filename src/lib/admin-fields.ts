// Shared admin form field parsers.
//
// Every parser takes the raw string a browser submits (`""` when the field is
// missing) and returns `{ ok: true, value }` or `{ ok: false, error }`, where
// `error` is the exact Spanish sentence rendered next to the input. The
// module is pure: no React, no `server-only`, no Next imports, so the same
// helpers run inside Server Actions and in unit tests.
//
// Number standard (owner decision): "." is the only decimal separator, money
// is integer US cents and weight is integer grams. Money and weight strings
// are parsed digit by digit, never through float multiplication.

import { cents, formatUsd } from "@/domain/money";
import { formatKilograms, grams, parseKilograms } from "@/domain/weight";

/** Result of parsing one submitted field. */
export type ParseResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: string };

/** Message used when a weight is not a valid "." decimal kilogram string. */
export const KG_FORMAT_MESSAGE = "Usa punto para decimales, ej. 7.5";

/** Message used when an amount is not a valid "." decimal USD string. */
export const USD_FORMAT_MESSAGE = "Usa punto para decimales, ej. 12.50";

/** Message used when an amount carries more than two decimals. */
export const USD_DECIMALS_MESSAGE = "Usa como máximo 2 decimales, ej. 12.50";

/** Message used when an HTML `datetime-local` value cannot be read. */
export const INVALID_DATETIME_MESSAGE = "Fecha y hora inválidas.";

/** Message used when a slug does not match the storefront slug shape. */
export const SLUG_FORMAT_MESSAGE = "Usa solo letras minúsculas, números y guiones.";

const KG_PATTERN = /^\d+(?:\.\d{1,3})?$/;
const ZERO_PATTERN = /^0+(?:\.0+)?$/;
const SLUG_PATTERN = /^[a-z0-9-]{1,64}$/;
const INTEGER_PATTERN = /^-?\d+$/;
const DATETIME_PATTERN = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/;

const ECUADOR_TIME_ZONE = "America/Guayaquil";

/**
 * Formats integer grams for an error message. `formatKilograms` only accepts
 * positive grams (a weight is always positive), so the zero floor used by
 * `min` gets its own literal.
 */
function gramsForMessage(value: number): string {
  return value > 0 ? formatKilograms(grams(value)) : "0 kg";
}

/** Formats a cents floor for an error message. */
function centsForMessage(value: number): string {
  return formatUsd(cents(Math.max(0, Math.trunc(value))));
}

// --- weight ---

export type KgFieldOptions = {
  /** Inclusive minimum in grams. */
  min?: number;
  /** Inclusive maximum in grams. */
  max?: number;
  /** Noun used in messages, without the article: "El {label} ...". */
  label?: string;
  /**
   * Accepts an explicit zero ("0", "0.0") as `0` grams. Off by default: a
   * weight is normally something that exists. The discount-tier threshold is
   * the real zero case — "discount from 0 kg" — so the species form asks for
   * it explicitly instead of reimplementing kilogram parsing.
   */
  allowZero?: boolean;
};

/**
 * Parses a weight typed in kilograms ("7.5", up to three decimals) into
 * integer grams. Format errors reuse `parseKilograms`, so the accepted syntax
 * is exactly the one the storefront uses (`.` only, at most 3 decimals).
 */
export function parseKgField(raw: string, options: KgFieldOptions = {}): ParseResult<number> {
  const { min, max, label = "peso", allowZero = false } = options;
  const trimmed = raw.trim();
  if (trimmed === "") {
    return { ok: false, error: `El ${label} es obligatorio.` };
  }
  if (!KG_PATTERN.test(trimmed)) {
    return { ok: false, error: KG_FORMAT_MESSAGE };
  }
  // A zero is not always wrong: a tier threshold may legitimately be 0 kg.
  if (allowZero && ZERO_PATTERN.test(trimmed)) {
    return { ok: true, value: 0 };
  }
  // `parseKilograms` rejects zero through `grams`: zero is a range error for
  // the admin (a lot weighs something), not a malformed number.
  if (ZERO_PATTERN.test(trimmed)) {
    return { ok: false, error: `El ${label} debe ser mayor que cero.` };
  }

  let gramsValue: number;
  try {
    gramsValue = parseKilograms(trimmed);
  } catch {
    return { ok: false, error: KG_FORMAT_MESSAGE };
  }

  if (min !== undefined && gramsValue < min) {
    return { ok: false, error: `El ${label} mínimo es ${gramsForMessage(min)}` };
  }
  if (max !== undefined && gramsValue > max) {
    return { ok: false, error: `El ${label} máximo es ${gramsForMessage(max)}` };
  }
  return { ok: true, value: gramsValue };
}

// --- money ---

type UsdAmountFailure = "empty" | "negative" | "decimals" | "format";

/**
 * Shared USD string -> cents reader: strips an optional "$" prefix, rejects
 * commas, signs and exponent notation, and allows at most two decimals.
 */
function readUsdCents(
  raw: string,
): { ok: true; value: number } | { ok: false; reason: UsdAmountFailure } {
  let trimmed = raw.trim();
  if (trimmed.startsWith("$")) {
    trimmed = trimmed.slice(1).trim();
  }
  if (trimmed === "") {
    return { ok: false, reason: "empty" };
  }
  if (trimmed.startsWith("-")) {
    return { ok: false, reason: "negative" };
  }
  if (!/^\d+(?:\.\d+)?$/.test(trimmed)) {
    return { ok: false, reason: "format" };
  }
  const [whole, fraction = ""] = trimmed.split(".");
  if (fraction.length > 2) {
    return { ok: false, reason: "decimals" };
  }
  const centsValue = Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
  if (!Number.isSafeInteger(centsValue)) {
    return { ok: false, reason: "format" };
  }
  return { ok: true, value: centsValue };
}

function usdFailureMessage(reason: UsdAmountFailure, label: string): string {
  switch (reason) {
    case "empty":
      return `El ${label} es obligatorio.`;
    case "negative":
      return `El ${label} no puede ser negativo.`;
    case "decimals":
      return USD_DECIMALS_MESSAGE;
    case "format":
      return USD_FORMAT_MESSAGE;
  }
}

export type UsdPerKgFieldOptions = {
  /** Noun used in messages, without the article. */
  label?: string;
};

/**
 * Parses a price typed in USD per kilogram ("12.5", "$12.50") into integer
 * cents per kilogram. The price is always positive: a species is never free.
 */
export function parseUsdPerKgField(
  raw: string,
  options: UsdPerKgFieldOptions = {},
): ParseResult<number> {
  const { label = "precio por kilo" } = options;
  const parsed = readUsdCents(raw);
  if (!parsed.ok) {
    return { ok: false, error: usdFailureMessage(parsed.reason, label) };
  }
  if (parsed.value === 0) {
    return { ok: false, error: `El ${label} debe ser mayor que cero.` };
  }
  return { ok: true, value: parsed.value };
}

export type UsdFieldOptions = {
  /** Inclusive floor in cents; defaults to 0 (a zero amount is valid). */
  minCents?: number;
  /** Noun used in messages, without the article. */
  label?: string;
};

/** Parses a USD amount ("12.50", "$12.50") into integer cents. */
export function parseUsdField(
  raw: string,
  options: UsdFieldOptions = {},
): ParseResult<number> {
  const { minCents = 0, label = "monto" } = options;
  const parsed = readUsdCents(raw);
  if (!parsed.ok) {
    return { ok: false, error: usdFailureMessage(parsed.reason, label) };
  }
  const floor = Math.max(0, Math.trunc(minCents));
  if (parsed.value < floor) {
    return { ok: false, error: `El ${label} mínimo es ${centsForMessage(floor)}` };
  }
  return { ok: true, value: parsed.value };
}

// --- percentages ---

/** Message for a percentage that is not a well-formed decimal. */
export const PERCENT_FORMAT_MESSAGE = "Usa punto para decimales, ej. 2.5";

/** Greatest percentage the panel accepts, in percent. */
export const PERCENT_MAX = 100;

/** Message for a percentage outside the 0..100 range (built from the label). */
export function percentRangeMessage(label: string): string {
  return `El ${label} debe estar entre 0 y ${PERCENT_MAX}.`;
}

/**
 * Parses a percentage typed by the operator ("8", "2.5", "0") into integer
 * basis points (800, 250, 0). Dot is the only decimal separator and at most
 * two decimals are accepted, matching the basis-point resolution the domain
 * stores. Zero is valid: "no discount from this threshold" is a real tier.
 */
export function parsePercentField(
  raw: string,
  options: { label?: string } = {},
): ParseResult<number> {
  const { label = "porcentaje" } = options;
  const trimmed = raw.trim();
  if (trimmed === "") {
    return { ok: false, error: `El ${label} es obligatorio.` };
  }
  if (!/^\d+(?:\.\d+)?$/.test(trimmed)) {
    return { ok: false, error: PERCENT_FORMAT_MESSAGE };
  }
  const [whole, fraction = ""] = trimmed.split(".");
  if (fraction.length > 2) {
    return { ok: false, error: PERCENT_FORMAT_MESSAGE };
  }
  const bps = Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
  if (!Number.isSafeInteger(bps)) {
    return { ok: false, error: PERCENT_FORMAT_MESSAGE };
  }
  if (bps > PERCENT_MAX * 100) {
    return { ok: false, error: percentRangeMessage(label) };
  }
  return { ok: true, value: bps };
}

// --- date and time ---

/**
 * Reads the wall-clock components of an instant in America/Guayaquil.
 * `Intl` is the authority for the zone (not a hardcoded UTC-5): Ecuador has
 * no DST today, but the offset is still derived from ICU instead of assumed.
 */
function ecuadorWallClock(instantMs: number): {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
} {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: ECUADOR_TIME_ZONE,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const parts = new Map<string, string>();
  for (const part of formatter.formatToParts(new Date(instantMs))) {
    if (part.type !== "literal") {
      parts.set(part.type, part.value);
    }
  }
  return {
    year: Number(parts.get("year")),
    month: Number(parts.get("month")),
    day: Number(parts.get("day")),
    hour: Number(parts.get("hour")),
    minute: Number(parts.get("minute")),
    second: Number(parts.get("second")),
  };
}

/** Offset of America/Guayaquil at an instant, in minutes east of UTC. */
function ecuadorOffsetMinutes(instantMs: number): number {
  const wall = ecuadorWallClock(instantMs);
  const wallAsUtc = Date.UTC(
    wall.year,
    wall.month - 1,
    wall.day,
    wall.hour,
    wall.minute,
    wall.second,
  );
  return Math.round((wallAsUtc - instantMs) / 60000);
}

/**
 * Parses an HTML `datetime-local` value ("2026-10-08T18:00", optional
 * ":ss") as Ecuador local time (America/Guayaquil) and returns the instant.
 * The offset is resolved through `Intl` and applied with the usual two-pass
 * wall clock -> instant conversion, so the result does not depend on the
 * server's own time zone. Values that do not exist as a local wall clock
 * (e.g. "2026-02-30T18:00") are rejected instead of being normalized.
 */
export function parseEcuadorDateTimeField(raw: string): ParseResult<Date> {
  const match = DATETIME_PATTERN.exec(raw.trim());
  if (match === null) {
    return { ok: false, error: INVALID_DATETIME_MESSAGE };
  }
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const hour = Number(match[4]);
  const minute = Number(match[5]);
  const second = match[6] === undefined ? 0 : Number(match[6]);
  if (
    month < 1 ||
    month > 12 ||
    day < 1 ||
    day > 31 ||
    hour > 23 ||
    minute > 59 ||
    second > 59
  ) {
    return { ok: false, error: INVALID_DATETIME_MESSAGE };
  }

  const wallAsUtc = Date.UTC(year, month - 1, day, hour, minute, second);
  const firstOffset = ecuadorOffsetMinutes(wallAsUtc);
  let instantMs = wallAsUtc - firstOffset * 60000;
  const secondOffset = ecuadorOffsetMinutes(instantMs);
  if (secondOffset !== firstOffset) {
    instantMs = wallAsUtc - secondOffset * 60000;
  }

  // Round-trip check: the instant must render back as the requested wall
  // clock. This rejects normalized dates and times skipped by the zone.
  const wall = ecuadorWallClock(instantMs);
  if (
    wall.year !== year ||
    wall.month !== month ||
    wall.day !== day ||
    wall.hour !== hour ||
    wall.minute !== minute ||
    wall.second !== second
  ) {
    return { ok: false, error: INVALID_DATETIME_MESSAGE };
  }

  return { ok: true, value: new Date(instantMs) };
}

// --- text ---

export type TextFieldOptions = {
  /** Minimum length, counted on the trimmed value. */
  min?: number;
  /** Maximum length, counted on the trimmed value. */
  max?: number;
  /** Noun used in messages, without the article. */
  label?: string;
  /** When false, an empty value is accepted as `""`. Defaults to true. */
  required?: boolean;
};

/** Parses a text input, trimmed, with optional length limits. */
export function parseTextField(
  raw: string,
  options: TextFieldOptions = {},
): ParseResult<string> {
  const { min, max, label = "campo", required = true } = options;
  const trimmed = raw.trim();
  if (trimmed === "") {
    if (!required) {
      return { ok: true, value: "" };
    }
    return { ok: false, error: `El ${label} es obligatorio.` };
  }
  if (min !== undefined && trimmed.length < min) {
    return {
      ok: false,
      error: `El ${label} debe tener al menos ${min} caracteres.`,
    };
  }
  if (max !== undefined && trimmed.length > max) {
    return {
      ok: false,
      error: `El ${label} no puede tener más de ${max} caracteres.`,
    };
  }
  return { ok: true, value: trimmed };
}

// --- identifiers ---

/**
 * Parses a species/URL slug: lowercase ASCII letters, digits and dashes, up
 * to 64 chars (the same shape the storefront and the cart validate).
 */
export function parseSlugField(raw: string): ParseResult<string> {
  const trimmed = raw.trim();
  if (!SLUG_PATTERN.test(trimmed)) {
    return { ok: false, error: SLUG_FORMAT_MESSAGE };
  }
  return { ok: true, value: trimmed };
}

export type IntFieldOptions = {
  /** Inclusive minimum. */
  min?: number;
  /** Inclusive maximum. */
  max?: number;
  /** Noun used in messages, without the article. */
  label?: string;
};

/** Parses a whole-number input (no decimals, no exponent notation). */
export function parseIntField(
  raw: string,
  options: IntFieldOptions = {},
): ParseResult<number> {
  const { min, max, label = "número" } = options;
  const trimmed = raw.trim();
  if (trimmed === "") {
    return { ok: false, error: `El ${label} es obligatorio.` };
  }
  if (!INTEGER_PATTERN.test(trimmed)) {
    return { ok: false, error: "Usa números enteros, sin decimales." };
  }
  const value = Number(trimmed);
  if (!Number.isSafeInteger(value)) {
    return { ok: false, error: `El ${label} es demasiado grande.` };
  }
  if (min !== undefined && value < min) {
    return { ok: false, error: `El ${label} mínimo es ${min}` };
  }
  if (max !== undefined && value > max) {
    return { ok: false, error: `El ${label} máximo es ${max}` };
  }
  return { ok: true, value };
}

export type SelectFieldOptions = {
  /** Noun used in messages, without the article. */
  label?: string;
};

/**
 * Parses a select input: the submitted value must be one of `allowed`
 * (case-sensitive, trimmed), otherwise it is rejected.
 */
export function parseSelectField(
  raw: string,
  allowed: readonly string[],
  options: SelectFieldOptions = {},
): ParseResult<string> {
  const { label = "campo" } = options;
  const trimmed = raw.trim();
  if (!allowed.includes(trimmed)) {
    return { ok: false, error: `Elige una opción válida para el ${label}.` };
  }
  return { ok: true, value: trimmed };
}
