// Pure admin logic for the VAT rates (IVA): the register-a-rate form parser,
// the append-only date rules, the "rate in force vs scheduled" summary and the
// Spanish labels the page reuses.
//
// No React, no `server-only`, no Prisma and no clock access: raw strings and
// stored rows come in, parsed values or Spanish messages come out, and every
// rule is unit-tested. The Server Action is the only caller that touches the
// database or the request instant.
//
// The rate selection is NOT reimplemented here: which rate is in force for a
// category at instant T is decided by `resolveVatRates` from `@/domain/tax`,
// the same function the cart quote uses (S4). This module only maps its
// `TaxError` to the Spanish sentence the operator reads, and identifies which
// stored row that resolution came from so the panel can print its date.
//
// The history is append-only (S3): a rate change is a NEW row with a new
// `effectiveFrom`. Nothing here can edit or delete a row, and the one rule the
// panel adds on top of the unique `(category, effectiveFrom)` constraint is
// that the new date must be strictly later than the latest row of its category
// (S5): a backdated row could never be retracted.

import {
  INVALID_DATETIME_MESSAGE,
  parseEcuadorDateTimeField,
  parsePercentField,
  parseSelectField,
  parseTextField,
  type ParseResult,
} from "@/lib/admin-fields";
import { VAT_CATEGORY_OPTIONS, vatCategoryLabel } from "@/lib/admin-species";
import { resolveVatRates, type DatedVatRate } from "@/domain/tax";
import type { VatCategory } from "@/domain/pricing";

/** Per-field Spanish messages, keyed by input name. */
export type TaxRateFieldErrors = Record<string, string>;

/** The raw strings the register-a-rate form submits (`""` when absent). */
export type TaxRateRawFields = {
  category: string;
  ratePercent: string;
  /** HTML `datetime-local` value, Ecuador wall clock. */
  effectiveFrom: string;
  /** Optional audit line of the change. */
  note: string;
};

/** Parsed, validated values of a new rate (append-only: no id, no update). */
export type TaxRateValues = {
  category: VatCategory;
  rateBps: number;
  effectiveFrom: Date;
  /** Trimmed note, or null when the operator left it empty. */
  note: string | null;
};

/** Initial raw values of the register form. */
export const EMPTY_TAX_RATE_RAW: TaxRateRawFields = {
  category: "STANDARD",
  ratePercent: "",
  effectiveFrom: "",
  note: "",
};

/** What the register form keeps between submissions. */
export type TaxRateFormState = {
  fieldErrors: TaxRateFieldErrors;
  formError?: string;
  raw: TaxRateRawFields;
};

/** Initial state of the register form, before the first submission. */
export const EMPTY_TAX_RATE_FORM_STATE: TaxRateFormState = {
  fieldErrors: {},
  raw: EMPTY_TAX_RATE_RAW,
};

/** Longest accepted audit note; the note is the audit line of the change. */
export const RATE_NOTE_MAX = 200;

/** Noun used in the percentage messages: "El porcentaje de IVA ...". */
const RATE_PERCENT_LABEL = "porcentaje de IVA";

/** The rate field is required: a rate without a start date applies to nothing. */
export const RATE_DATE_REQUIRED_MESSAGE = "La fecha de vigencia es obligatoria.";

/** Spanish sentence for a `(category, effectiveFrom)` the history already has. */
export const DUPLICATE_RATE_DATE_MESSAGE =
  "Ya existe una tarifa de esta categoría con esa fecha.";

/** Spanish sentence for a date that is not strictly later than the latest row. */
export const BACKDATED_RATE_MESSAGE =
  "La fecha debe ser posterior a la última tarifa registrada de esta categoría.";

/** Spanish sentence for a category with no rate in force at the instant. */
export const NO_RATE_IN_FORCE_MESSAGE =
  "No hay ninguna tarifa de IVA vigente para esta categoría.";

/** Spanish sentence for a history that violates the unique date constraint. */
export const DUPLICATE_RATE_HISTORY_MESSAGE =
  "Hay dos tarifas con la misma fecha para esta categoría.";

/** Spanish sentence for a stored rate outside 0..100 %. */
export const INVALID_RATE_MESSAGE =
  "Hay una tarifa de IVA con un porcentaje inválido.";

/** Status labels of one history row, in Spanish, never colour-only. */
export const RATE_IN_FORCE_LABEL = "En vigor";
export const RATE_SCHEDULED_LABEL = "Programada";
export const RATE_HISTORICAL_LABEL = "Anterior";

/**
 * Sentence the page shows when a rate is dated in the future (S7): the
 * scheduled row is listed, but the storefront keeps charging the current one.
 */
export const RATE_SCHEDULED_NOTICE =
  "Una tarifa programada todavía no se aplica: la tarifa vigente sigue cobrándose en la tienda hasta su fecha.";

/** One stored row of the append-only history. */
export type TaxRateHistoryEntry = DatedVatRate;

/** Rate status of one history row at an instant. */
export type TaxRateStatus = "IN_FORCE" | "SCHEDULED" | "HISTORICAL";

/** Spanish label of one rate status. */
export function taxRateStatusLabel(status: TaxRateStatus): string {
  switch (status) {
    case "IN_FORCE":
      return RATE_IN_FORCE_LABEL;
    case "SCHEDULED":
      return RATE_SCHEDULED_LABEL;
    case "HISTORICAL":
      return RATE_HISTORICAL_LABEL;
  }
}

/**
 * Status of one history row: the row `resolveVatRates` resolved is in force, a
 * row dated after the instant is scheduled, and anything older is history.
 */
export function taxRateStatus(input: {
  rate: TaxRateHistoryEntry;
  at: Date;
  /** `effectiveFrom` of the row resolved at `at`, or null when none applies. */
  inForceEffectiveFrom: Date | null;
}): TaxRateStatus {
  const { rate, at, inForceEffectiveFrom } = input;
  const timestamp = rate.effectiveFrom.getTime();
  if (
    inForceEffectiveFrom !== null &&
    timestamp === inForceEffectiveFrom.getTime()
  ) {
    return "IN_FORCE";
  }
  return timestamp > at.getTime() ? "SCHEDULED" : "HISTORICAL";
}

/**
 * Parses the register-a-rate form. Every field is validated server-side (the
 * client is never the authority) and all failures are reported together, so the
 * operator fixes the form in one pass. The date rules that need the stored
 * history (duplicate, strictly later) live in `taxRateDateError`.
 */
export function parseTaxRateForm(
  raw: TaxRateRawFields,
): { ok: true; values: TaxRateValues } | { ok: false; fieldErrors: TaxRateFieldErrors } {
  const fieldErrors: TaxRateFieldErrors = {};

  const category = parseSelectField(raw.category, VAT_CATEGORY_OPTIONS, {
    label: "tipo de IVA",
  });
  if (!category.ok) {
    fieldErrors.category = category.error;
  }

  const ratePercent = parsePercentField(raw.ratePercent, {
    label: RATE_PERCENT_LABEL,
  });
  if (!ratePercent.ok) {
    fieldErrors.ratePercent = ratePercent.error;
  }

  // A blank date is a missing required field, not an unreadable one: the
  // operator reads "es obligatoria", not "formato inválido".
  const trimmedDate = raw.effectiveFrom.trim();
  const effectiveFrom: ParseResult<Date> =
    trimmedDate === ""
      ? { ok: false, error: RATE_DATE_REQUIRED_MESSAGE }
      : parseEcuadorDateTimeField(trimmedDate);
  if (!effectiveFrom.ok) {
    fieldErrors.effectiveFrom = effectiveFrom.error;
  }

  const note = parseTextField(raw.note, {
    required: false,
    max: RATE_NOTE_MAX,
    // The shared parser builds "El {label} ..."; the noun keeps the sentence
    // grammatical and is the one the operator reads.
    label: "texto de la nota",
  });
  if (!note.ok) {
    fieldErrors.note = note.error;
  }

  if (
    !category.ok ||
    !ratePercent.ok ||
    !effectiveFrom.ok ||
    !note.ok
  ) {
    return { ok: false, fieldErrors };
  }

  return {
    ok: true,
    values: {
      category: category.value as VatCategory,
      rateBps: ratePercent.value,
      effectiveFrom: effectiveFrom.value,
      note: note.value === "" ? null : note.value,
    },
  };
}

/**
 * The two rules an append-only rate history adds on top of a well-formed
 * submission (S5): no duplicate `(category, effectiveFrom)`, and the new date
 * strictly later than the latest row of that category. Returns the Spanish
 * message to show next to the date field, or null when the date is accepted.
 *
 * `history` is the whole table (every category): only the rows of `category`
 * can conflict or be "the latest". The clock is not read here — the caller
 * passes the instant only when it needs the status of each row.
 */
export function taxRateDateError(input: {
  category: VatCategory;
  effectiveFrom: Date;
  history: readonly TaxRateHistoryEntry[];
}): string | null {
  const { category, effectiveFrom, history } = input;
  const timestamp = effectiveFrom.getTime();

  let latest: number | null = null;
  let duplicate = false;
  for (const entry of history) {
    if (entry.category !== category) {
      continue;
    }
    const entryTimestamp = entry.effectiveFrom.getTime();
    if (entryTimestamp === timestamp) {
      duplicate = true;
    }
    if (latest === null || entryTimestamp > latest) {
      latest = entryTimestamp;
    }
  }

  // The duplicate is checked first: the same date is refused by both rules, and
  // the unique constraint is the one the operator can see in the history.
  if (duplicate) {
    return DUPLICATE_RATE_DATE_MESSAGE;
  }
  if (latest !== null && timestamp <= latest) {
    return BACKDATED_RATE_MESSAGE;
  }
  return null;
}

/**
 * Maps a `TaxError` code from `@/domain/tax` to the Spanish sentence the panel
 * shows. Anything that is not a tax error is rethrown: it is a real bug, not a
 * message to render.
 */
export function taxErrorMessage(error: unknown): string {
  const code =
    typeof error === "object" && error !== null && "code" in error
      ? (error as { code: unknown }).code
      : undefined;
  switch (code) {
    case "NO_RATE_IN_EFFECT":
      return NO_RATE_IN_FORCE_MESSAGE;
    case "DUPLICATE_RATE":
      return DUPLICATE_RATE_HISTORY_MESSAGE;
    case "INVALID_RATE":
      return INVALID_RATE_MESSAGE;
    case "INVALID_INSTANT":
      // Defensive: the panel always asks with a fresh, valid instant.
      return INVALID_DATETIME_MESSAGE;
    default:
      throw error;
  }
}

/** One category's slice of the summary the page renders. */
export interface TaxCategorySummary {
  category: VatCategory;
  /** Spanish label of the category. */
  label: string;
  /**
   * The rate in force at `at`, resolved by `resolveVatRates`, with the
   * `effectiveFrom` of the row it came from. Null when the domain refuses
   * (no row applies); `formError` then says why.
   */
  inForce: { rateBps: number; effectiveFrom: Date } | null;
  /** The nearest row dated after `at`, pending, or null. */
  scheduled: { rateBps: number; effectiveFrom: Date } | null;
  /** Spanish sentence when the domain could not resolve a rate, or null. */
  formError: string | null;
}

/**
 * Per-category "rate in force vs scheduled" summary (S7).
 *
 * The percentage in force comes from `resolveVatRates` (S4), never from a scan
 * of this module; the row it resolved for each category is identified by its
 * `effectiveFrom` so the panel can print the date, and every row dated after
 * `at` is reported as scheduled without ever influencing the current rate.
 */
export function summarizeTaxRates(input: {
  rates: readonly TaxRateHistoryEntry[];
  at: Date;
}): TaxCategorySummary[] {
  const { rates, at } = input;
  const atTimestamp = at.getTime();

  let resolved: Record<VatCategory, number> | null = null;
  let formError: string | null = null;
  try {
    resolved = resolveVatRates([...rates], at);
  } catch (error) {
    formError = taxErrorMessage(error);
  }

  return VAT_CATEGORY_OPTIONS.map((category) => {
    const own = rates.filter((rate) => rate.category === category);

    let inForceEffectiveFrom: Date | null = null;
    let scheduled: TaxCategorySummary["scheduled"] = null;
    for (const rate of own) {
      const timestamp = rate.effectiveFrom.getTime();
      if (timestamp <= atTimestamp) {
        // The row the domain function resolves: the greatest date not after
        // `at`. Its own bps is never used as the answer.
        if (
          inForceEffectiveFrom === null ||
          timestamp > inForceEffectiveFrom.getTime()
        ) {
          inForceEffectiveFrom = rate.effectiveFrom;
        }
        continue;
      }
      if (
        scheduled === null ||
        timestamp < scheduled.effectiveFrom.getTime()
      ) {
        scheduled = { rateBps: rate.rateBps, effectiveFrom: rate.effectiveFrom };
      }
    }

    return {
      category,
      label: vatCategoryLabel(category),
      inForce:
        resolved !== null && inForceEffectiveFrom !== null
          ? { rateBps: resolved[category], effectiveFrom: inForceEffectiveFrom }
          : null,
      scheduled,
      formError,
    };
  });
}
