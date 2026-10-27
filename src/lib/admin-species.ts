// Pure admin logic for species (especies): the create and edit form parsers,
// the tier-set rules, the season-window rules and the Spanish presentation
// labels the pages reuse.
//
// No React, no `server-only`, no Prisma and no clock access: raw strings come
// in, parsed values or Spanish per-field messages come out, and every rule is
// unit-tested. The Server Actions are the only callers that touch the database
// or the request instant.
//
// The numeric rules are NOT reimplemented here: a tier set is validated by
// `validateTierSet` from `@/domain/pricing` (the same function the quote
// engine runs) and a season window by `validateSeasonWindow` from
// `@/domain/season` (the same rule the storefront uses to decide whether a
// seasonal species is on sale). What lives here is only the mapping from
// those domain errors to the Spanish sentences the operator reads.

import {
  parseEcuadorDateTimeField,
  parseKgField,
  parsePercentField,
  parseSelectField,
  parseSlugField,
  parseTextField,
  parseUsdPerKgField,
  percentRangeMessage,
  type ParseResult,
} from "@/lib/admin-fields";
import {
  validateTierSet,
  type DiscountPolicy,
  type DiscountTier,
  type VatCategory,
} from "@/domain/pricing";
import { validateSeasonWindow, type SeasonWindow } from "@/domain/season";

/** Per-field Spanish messages, keyed by input name. */
export type SpeciesFieldErrors = Record<string, string>;

/** The raw strings the edit form submits (`""` when a field is absent). */
export type SpeciesEditRawFields = {
  name: string;
  description: string;
  pricePerKg: string;
  minOrderKg: string;
  orderStepKg: string;
  discountPolicy: string;
  vatCategory: string;
  /** Checkbox: `"on"` when checked, `""` when not. */
  isSeasonal: string;
};

/** The create form additionally submits the slug, which is then immutable. */
export type SpeciesCreateRawFields = SpeciesEditRawFields & { slug: string };

/** Parsed, validated values of a species (no slug: that is creation-only). */
export type SpeciesValues = {
  name: string;
  /** Trimmed description, or null when the operator left it empty. */
  description: string | null;
  pricePerKgCents: number;
  minOrderGrams: number;
  orderStepGrams: number;
  discountPolicy: DiscountPolicy;
  vatCategory: VatCategory;
  isSeasonal: boolean;
};

/** Parsed values of a new species: the slug is fixed from this point on. */
export type SpeciesCreateValues = SpeciesValues & { slug: string };

/** Initial raw values of the create form, before the first submission. */
export const EMPTY_SPECIES_CREATE_RAW: SpeciesCreateRawFields = {
  slug: "",
  name: "",
  description: "",
  pricePerKg: "",
  minOrderKg: "1",
  orderStepKg: "0.5",
  discountPolicy: "GLOBAL",
  vatCategory: "STANDARD",
  isSeasonal: "",
};

/** Initial raw values of the edit form (policy and category come from the DB). */
export const EMPTY_SPECIES_EDIT_RAW: SpeciesEditRawFields = {
  name: "",
  description: "",
  pricePerKg: "",
  minOrderKg: "1",
  orderStepKg: "0.5",
  discountPolicy: "GLOBAL",
  vatCategory: "STANDARD",
  isSeasonal: "",
};

/** Longest accepted species name, counted on the trimmed value. */
export const SPECIES_NAME_MAX = 80;

/** Longest accepted description, counted on the trimmed value. */
export const SPECIES_DESCRIPTION_MAX = 500;

/**
 * Upper bound for the minimum order and the step, in grams. The columns are
 * signed 32-bit integers and no real order of one species reaches a tonne, so
 * anything above it is a typo that would otherwise reach the database.
 */
export const SPECIES_WEIGHT_MAX_GRAMS = 1_000_000;

/** The discount policies the panel may set, in form order. */
export const DISCOUNT_POLICY_OPTIONS: readonly DiscountPolicy[] = [
  "GLOBAL",
  "CUSTOM",
  "NONE",
];

/** The VAT categories the panel may set, in form order. */
export const VAT_CATEGORY_OPTIONS: readonly VatCategory[] = [
  "STANDARD",
  "ZERO_RATED",
];

/** Spanish labels of the discount policies (never colour-only in the UI). */
const DISCOUNT_POLICY_LABELS: Record<DiscountPolicy, string> = {
  GLOBAL: "Tramos generales",
  CUSTOM: "Tramos propios",
  NONE: "Sin descuento",
};

/** Spanish labels of the VAT categories. */
const VAT_CATEGORY_LABELS: Record<VatCategory, string> = {
  STANDARD: "IVA estándar",
  ZERO_RATED: "IVA 0%",
};

/** Form-level message: a species with no seasons cannot be sold. */
export const SEASONAL_WITHOUT_SEASON_MESSAGE =
  "Una especie de temporada necesita al menos una temporada para venderse.";

/** Form-level message: the CUSTOM policy needs at least one tier row. */
export const CUSTOM_TIERS_REQUIRED_MESSAGE =
  "La política de tramos propios necesita al menos un tramo.";

/** Spanish sentence for the domain duplicate-threshold error. */
export const DUPLICATE_TIER_MESSAGE = "Hay dos tramos con el mismo peso mínimo.";

/** Spanish sentence for a discount outside 0..100 % (same text the field uses). */
export const TIER_PERCENT_RANGE_MESSAGE = percentRangeMessage("descuento");

/** Spanish sentence for an end date earlier than its start date. */
export const SEASON_END_BEFORE_START_MESSAGE =
  "La fecha de fin no puede ser anterior a la de inicio.";

/** Spanish label of one discount policy. */
export function discountPolicyLabel(policy: DiscountPolicy): string {
  return DISCOUNT_POLICY_LABELS[policy];
}

/** Spanish label of one VAT category. */
export function vatCategoryLabel(category: VatCategory): string {
  return VAT_CATEGORY_LABELS[category];
}

/** Reads the seasonal checkbox: a checkbox that is off submits nothing. */
function parseCheckbox(raw: string): boolean {
  return raw === "on" || raw === "true";
}

/**
 * Parses the fields shared by the create and edit forms. The slug is absent on
 * purpose: only `parseSpeciesCreateForm` reads it, which is what makes the
 * slug immutable in practice rather than by convention.
 */
function parseSharedFields(
  raw: SpeciesEditRawFields,
): { ok: true; values: SpeciesValues } | { ok: false; fieldErrors: SpeciesFieldErrors } {
  const fieldErrors: SpeciesFieldErrors = {};

  const name = parseTextField(raw.name, {
    max: SPECIES_NAME_MAX,
    label: "nombre",
  });
  if (!name.ok) {
    fieldErrors.name = name.error;
  }

  const description = parseTextField(raw.description, {
    required: false,
    max: SPECIES_DESCRIPTION_MAX,
    label: "descripción",
  });
  if (!description.ok) {
    fieldErrors.description = description.error;
  }

  const price = parseUsdPerKgField(raw.pricePerKg);
  if (!price.ok) {
    fieldErrors.pricePerKg = price.error;
  }

  const minOrder = parseKgField(raw.minOrderKg, {
    min: 1,
    max: SPECIES_WEIGHT_MAX_GRAMS,
    label: "pedido mínimo",
  });
  if (!minOrder.ok) {
    fieldErrors.minOrderKg = minOrder.error;
  }

  const orderStep = parseKgField(raw.orderStepKg, {
    min: 1,
    max: SPECIES_WEIGHT_MAX_GRAMS,
    label: "paso del pedido",
  });
  if (!orderStep.ok) {
    fieldErrors.orderStepKg = orderStep.error;
  }

  const discountPolicy = parseSelectField(
    raw.discountPolicy,
    DISCOUNT_POLICY_OPTIONS,
    { label: "tipo de descuento" },
  );
  if (!discountPolicy.ok) {
    fieldErrors.discountPolicy = discountPolicy.error;
  }

  const vatCategory = parseSelectField(raw.vatCategory, VAT_CATEGORY_OPTIONS, {
    label: "tipo de IVA",
  });
  if (!vatCategory.ok) {
    fieldErrors.vatCategory = vatCategory.error;
  }

  if (
    !name.ok ||
    !description.ok ||
    !price.ok ||
    !minOrder.ok ||
    !orderStep.ok ||
    !discountPolicy.ok ||
    !vatCategory.ok
  ) {
    return { ok: false, fieldErrors };
  }

  return {
    ok: true,
    values: {
      name: name.value,
      description: description.value === "" ? null : description.value,
      pricePerKgCents: price.value,
      minOrderGrams: minOrder.value,
      orderStepGrams: orderStep.value,
      discountPolicy: discountPolicy.value as DiscountPolicy,
      vatCategory: vatCategory.value as VatCategory,
      isSeasonal: parseCheckbox(raw.isSeasonal),
    },
  };
}

/**
 * Parses the create-species form, including its slug. Every field is validated
 * server-side (the client is never the authority) and all failures are reported
 * together, so the operator fixes the form in one pass.
 */
export function parseSpeciesCreateForm(
  raw: SpeciesCreateRawFields,
): { ok: true; values: SpeciesCreateValues } | { ok: false; fieldErrors: SpeciesFieldErrors } {
  const shared = parseSharedFields(raw);
  const slug: ParseResult<string> = parseSlugField(raw.slug);

  if (!shared.ok || !slug.ok) {
    const fieldErrors: SpeciesFieldErrors = shared.ok ? {} : { ...shared.fieldErrors };
    if (!slug.ok) {
      fieldErrors.slug = slug.error;
    }
    return { ok: false, fieldErrors };
  }

  return { ok: true, values: { ...shared.values, slug: slug.value } };
}

/**
 * Parses the edit-species form. It deliberately does not accept a slug: an
 * edit that tries to send one is ignored, so a renamed species cannot break
 * the storefront URLs or the cart lines already pointing at it.
 */
export function parseSpeciesEditForm(
  raw: SpeciesEditRawFields,
): { ok: true; values: SpeciesValues } | { ok: false; fieldErrors: SpeciesFieldErrors } {
  return parseSharedFields(raw);
}

/** One tier row as submitted: both values are raw strings. */
export type TierRawRow = {
  minTotalKg: string;
  discountPercent: string;
};

/**
 * Parses the tier editor rows into the domain tier shape.
 *
 * A row with both fields empty is an unused row the operator left behind, not
 * an error. A half-filled row is an error: silently dropping it would apply a
 * discount the operator did not confirm. The duplicate-threshold rule comes
 * from the pricing domain (`validateTierSet`), so the panel cannot accept a set
 * the quote engine would reject.
 */
export function parseTierRows(
  rows: readonly TierRawRow[],
): { ok: true; tiers: DiscountTier[] } | { ok: false; fieldErrors: SpeciesFieldErrors; formError?: string } {
  const fieldErrors: SpeciesFieldErrors = {};
  const tiers: DiscountTier[] = [];

  rows.forEach((row, index) => {
    const thresholdEmpty = row.minTotalKg.trim() === "";
    const percentEmpty = row.discountPercent.trim() === "";
    if (thresholdEmpty && percentEmpty) {
      return;
    }

    const minTotal = parseKgField(row.minTotalKg, {
      allowZero: true,
      max: SPECIES_WEIGHT_MAX_GRAMS,
      label: "peso mínimo del tramo",
    });
    if (!minTotal.ok) {
      fieldErrors[`tier-${index}-minTotalKg`] = minTotal.error;
    }

    const discount = parsePercentField(row.discountPercent, {
      label: "descuento",
    });
    if (!discount.ok) {
      fieldErrors[`tier-${index}-discountPercent`] = discount.error;
    }

    if (minTotal.ok && discount.ok) {
      tiers.push({ minTotalGrams: minTotal.value, discountBps: discount.value });
    }
  });

  if (Object.keys(fieldErrors).length > 0) {
    return { ok: false, fieldErrors };
  }

  try {
    return { ok: true, tiers: validateTierSet(tiers, "tiers") };
  } catch (error) {
    // The domain error names the rule; the operator reads the panel's wording.
    const code =
      typeof error === "object" && error !== null && "code" in error
        ? (error as { code: unknown }).code
        : undefined;
    if (code === "DUPLICATE_TIER_THRESHOLD") {
      return { ok: false, fieldErrors: {}, formError: DUPLICATE_TIER_MESSAGE };
    }
    if (code === "INVALID_TIER") {
      return { ok: false, fieldErrors: {}, formError: TIER_PERCENT_RANGE_MESSAGE };
    }
    throw error;
  }
}

/**
 * Form-level validation of the policy/tier coupling: a CUSTOM species must own
 * at least one tier (the quote engine refuses a CUSTOM line without tiers), and
 * a non-CUSTOM species must not keep stale tier rows around pretending to be a
 * discount. Returns null when the pair is consistent.
 */
export function speciesTierFormError(input: {
  discountPolicy: DiscountPolicy;
  tiers: readonly DiscountTier[];
}): string | null {
  if (input.discountPolicy === "CUSTOM" && input.tiers.length === 0) {
    return CUSTOM_TIERS_REQUIRED_MESSAGE;
  }
  return null;
}

/** The season-add form submits two `datetime-local` strings. */
export type SeasonRawFields = {
  startsAt: string;
  endsAt: string;
};

/** Initial raw values of the add-season form. */
export const EMPTY_SEASON_RAW: SeasonRawFields = { startsAt: "", endsAt: "" };

/**
 * Parses the add-season form into a domain season window. Both datetimes are
 * Ecuador wall-clock values; the ordering rule comes from the season domain.
 */
export function parseSeasonWindowForm(
  raw: SeasonRawFields,
): { ok: true; window: SeasonWindow } | { ok: false; fieldErrors: SpeciesFieldErrors } {
  const fieldErrors: SpeciesFieldErrors = {};

  const startsAt = parseEcuadorDateTimeField(raw.startsAt);
  if (!startsAt.ok) {
    fieldErrors.startsAt = startsAt.error;
  }
  const endsAt = parseEcuadorDateTimeField(raw.endsAt);
  if (!endsAt.ok) {
    fieldErrors.endsAt = endsAt.error;
  }

  if (!startsAt.ok || !endsAt.ok) {
    return { ok: false, fieldErrors };
  }

  const window: SeasonWindow = { startsAt: startsAt.value, endsAt: endsAt.value };
  try {
    validateSeasonWindow(window);
  } catch {
    return {
      ok: false,
      fieldErrors: { endsAt: SEASON_END_BEFORE_START_MESSAGE },
    };
  }
  return { ok: true, window };
}

/**
 * Warning the species page shows when the configuration cannot sell at all: a
 * seasonal species with no window is unavailable every day of the year, which
 * looks like a bug in the storefront unless the panel says why.
 */
export function seasonalWithoutSeasonMessage(input: {
  isSeasonal: boolean;
  seasonCount: number;
}): string | null {
  if (input.isSeasonal && input.seasonCount === 0) {
    return SEASONAL_WITHOUT_SEASON_MESSAGE;
  }
  return null;
}

// --- form state and form prefill ---

/** What the create form keeps between submissions. */
export type SpeciesCreateFormState = {
  fieldErrors: SpeciesFieldErrors;
  formError?: string;
  raw: SpeciesCreateRawFields;
};

/** What the edit form keeps between submissions. */
export type SpeciesFormState = {
  fieldErrors: SpeciesFieldErrors;
  formError?: string;
  raw: SpeciesEditRawFields;
};

/** What the add-season form keeps between submissions. */
export type SeasonFormState = {
  fieldErrors: SpeciesFieldErrors;
  formError?: string;
  raw: SeasonRawFields;
};

/** Initial state of the create form, before the first submission. */
export const EMPTY_SPECIES_CREATE_FORM_STATE: SpeciesCreateFormState = {
  fieldErrors: {},
  raw: EMPTY_SPECIES_CREATE_RAW,
};

/** Initial state of the edit form, before the first submission. */
export const EMPTY_SPECIES_FORM_STATE: SpeciesFormState = {
  fieldErrors: {},
  raw: EMPTY_SPECIES_EDIT_RAW,
};

/** Initial state of the add-season form, before the first submission. */
export const EMPTY_SEASON_FORM_STATE: SeasonFormState = {
  fieldErrors: {},
  raw: EMPTY_SEASON_RAW,
};

/**
 * Pairs the two submitted tier columns into rows.
 *
 * The tier editor is a repeated pair of inputs, so a form submits two parallel
 * lists. The longer list defines the row count: a row whose partner is missing
 * becomes an empty value and is then rejected by `parseTierRows` as a
 * half-filled row, instead of silently shifting every later row by one.
 */
export function zipTierColumns(
  minTotalKg: readonly string[],
  discountPercent: readonly string[],
): TierRawRow[] {
  const count = Math.max(minTotalKg.length, discountPercent.length);
  const rows: TierRawRow[] = [];
  for (let index = 0; index < count; index += 1) {
    rows.push({
      minTotalKg: minTotalKg[index] ?? "",
      discountPercent: discountPercent[index] ?? "",
    });
  }
  return rows;
}

/** Formats integer cents as an input value: 1250 -> "12.5", 900 -> "9". */
export function toPriceInputValue(pricePerKgCents: number): string {
  const whole = Math.floor(pricePerKgCents / 100);
  const remainder = pricePerKgCents % 100;
  if (remainder === 0) {
    return String(whole);
  }
  return `${whole}.${String(remainder).padStart(2, "0").replace(/0$/, "")}`;
}

/** Formats integer grams as an input value: 1000 -> "1", 2500 -> "2.5". */
export function toKgInputValue(gramsValue: number): string {
  if (gramsValue === 0) {
    return "0";
  }
  const whole = Math.floor(gramsValue / 1000);
  const remainder = gramsValue % 1000;
  if (remainder === 0) {
    return String(whole);
  }
  return `${whole}.${String(remainder).padStart(3, "0").replace(/0+$/, "")}`;
}

/** Formats basis points as an input value: 800 -> "8", 250 -> "2.5". */
export function toPercentInputValue(bps: number): string {
  const whole = Math.floor(bps / 100);
  const remainder = bps % 100;
  if (remainder === 0) {
    return String(whole);
  }
  return `${whole}.${String(remainder).padStart(2, "0").replace(/0+$/, "")}`;
}

/** The species fields the edit form prefills from the database row. */
export interface SpeciesPrefillSource {
  name: string;
  description: string | null;
  pricePerKgCents: number;
  minOrderGrams: number;
  orderStepGrams: number;
  discountPolicy: DiscountPolicy;
  vatCategory: VatCategory;
  isSeasonal: boolean;
}

/**
 * Turns a stored species into the raw strings the edit form shows. Formatting
 * lives here (not in the page) so the round trip is unit-tested: every value
 * the panel renders must parse back to the value it came from.
 */
export function toSpeciesEditRaw(species: SpeciesPrefillSource): SpeciesEditRawFields {
  return {
    name: species.name,
    description: species.description ?? "",
    pricePerKg: toPriceInputValue(species.pricePerKgCents),
    minOrderKg: toKgInputValue(species.minOrderGrams),
    orderStepKg: toKgInputValue(species.orderStepGrams),
    discountPolicy: species.discountPolicy,
    vatCategory: species.vatCategory,
    isSeasonal: species.isSeasonal ? "on" : "",
  };
}

/** Turns stored tiers into the editor's raw rows. */
export function toTierRawRows(
  tiers: readonly { minTotalGrams: number; discountBps: number }[],
): TierRawRow[] {
  return tiers.map((tier) => ({
    minTotalKg: toKgInputValue(tier.minTotalGrams),
    discountPercent: toPercentInputValue(tier.discountBps),
  }));
}
