// Pure admin logic for lots (desembarques): the create-form parser, the
// duplicate-landing rule, the insert shape and the two presentation helpers
// the pages reuse.
//
// No React, no `server-only`, no Prisma and no clock access: raw strings come
// in, parsed values or Spanish per-field messages come out, and every rule is
// unit-tested. The Server Action is the only caller that touches the database
// or the request instant.

import {
  parseEcuadorDateTimeField,
  parseKgField,
  parseSelectField,
  parseTextField,
  type ParseResult,
} from "@/lib/admin-fields";
import { formatKilograms, isGrams } from "@/domain/weight";

/** Per-field Spanish messages, keyed by input name. */
export type LotFieldErrors = Record<string, string>;

/** The raw strings the create form submits (`""` when a field is absent). */
export type LotRawFields = {
  species: string;
  landedAt: string;
  totalKg: string;
  notes: string;
};

/** Parsed, validated values of a landing. */
export type LotValues = {
  /** Validated against the active species list by the caller's options. */
  speciesSlug: string;
  landedAt: Date;
  totalGrams: number;
  /** Trimmed note, or null when the operator left it empty. */
  notes: string | null;
};

/** Shape handed to `db.lot.create`. */
export type LotInsert = {
  speciesId: string;
  landedAt: Date;
  totalGrams: number;
  reservedGrams: number;
  status: "OPEN";
  notes: string | null;
};

/** What the client form keeps between submissions. */
export type LotFormState = {
  fieldErrors: LotFieldErrors;
  formError?: string;
  raw: LotRawFields;
};

/** Initial state of the create form, before the first submission. */
export const EMPTY_LOT_FORM_STATE: LotFormState = {
  fieldErrors: {},
  raw: { species: "", landedAt: "", totalKg: "", notes: "" },
};

/** Smallest landing the panel accepts: 0.5 kg (owner decision). */
export const LOT_MIN_TOTAL_GRAMS = 500;

/** Maximum length of the optional note, counted on the trimmed value. */
export const LOT_NOTES_MAX = 500;

/**
 * Duplicate landing warning. Two landings of the same species on the same
 * Ecuador day with the same weight are almost always a double submit, so the
 * form warns instead of silently creating a second row. It is a warning, not
 * a constraint: the rule lives here and not in the database because a real
 * double landing is possible.
 */
export const LOT_DUPLICATE_MESSAGE = "Ya existe un desembarque igual para esa fecha.";

// The admin writes datetimes as wall-clock Ecuador times; ICU is the authority
// for the zone (no hardcoded UTC-5).
const ECUADOR_TIME_ZONE = "America/Guayaquil";

function ecuadorParts(date: Date): Map<string, string> {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: ECUADOR_TIME_ZONE,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
  const parts = new Map<string, string>();
  for (const part of formatter.formatToParts(date)) {
    if (part.type !== "literal") {
      parts.set(part.type, part.value);
    }
  }
  return parts;
}

/**
 * Calendar day of an instant in Ecuador, as `YYYY-MM-DD`. The duplicate rule
 * groups landings by this key, so a landing at 23:59 and one at 00:01 are on
 * different days even though they are two minutes apart.
 */
export function ecuadorDayKey(date: Date): string {
  const parts = ecuadorParts(date);
  return `${parts.get("year")}-${parts.get("month")}-${parts.get("day")}`;
}

/**
 * Formats an instant as the value an HTML `datetime-local` input shows
 * (`YYYY-MM-DDTHH:mm`, Ecuador wall clock). Inverse of
 * `parseEcuadorDateTimeField`; shared with the shipment form.
 */
export function toEcuadorDateTimeLocalValue(date: Date): string {
  const parts = ecuadorParts(date);
  return `${parts.get("year")}-${parts.get("month")}-${parts.get("day")}T${parts.get("hour")}:${parts.get("minute")}`;
}

/**
 * Kilogram label for lists and tables. `formatKilograms` rejects zero (a
 * weight is positive), but "0 kg" is a real value in the panel: reserved and
 * available grams are legitimately zero.
 */
export function formatWeightLabel(gramsValue: number): string {
  return isGrams(gramsValue) ? formatKilograms(gramsValue) : "0 kg";
}

/**
 * Parses the create-landing form. Every field is validated server-side (the
 * client is never the authority) and all failures are reported together, so
 * the operator fixes the form in one pass.
 */
export function parseLotForm(
  raw: LotRawFields,
  options: { speciesSlugs: readonly string[] },
): { ok: true; values: LotValues } | { ok: false; fieldErrors: LotFieldErrors } {
  const fieldErrors: LotFieldErrors = {};

  const species = parseSelectField(raw.species, options.speciesSlugs, {
    // "desembarque" keeps the shared select message grammatical: "Elige una
    // opción válida para el desembarque."
    label: "desembarque",
  });
  if (!species.ok) {
    fieldErrors.species = species.error;
  }

  const landedAt = parseEcuadorDateTimeField(raw.landedAt);
  if (!landedAt.ok) {
    fieldErrors.landedAt = landedAt.error;
  }

  const totalGrams = parseKgField(raw.totalKg, {
    min: LOT_MIN_TOTAL_GRAMS,
    label: "peso total",
  });
  if (!totalGrams.ok) {
    fieldErrors.totalKg = totalGrams.error;
  }

  const notes: ParseResult<string> = parseTextField(raw.notes, {
    required: false,
    max: LOT_NOTES_MAX,
    label: "comentario",
  });
  if (!notes.ok) {
    fieldErrors.notes = notes.error;
  }

  if (!species.ok || !landedAt.ok || !totalGrams.ok || !notes.ok) {
    return { ok: false, fieldErrors };
  }

  return {
    ok: true,
    values: {
      speciesSlug: species.value,
      landedAt: landedAt.value,
      totalGrams: totalGrams.value,
      notes: notes.value === "" ? null : notes.value,
    },
  };
}

/** The parts of an existing lot the duplicate rule reads. */
export interface ExistingLot {
  landedAt: Date;
  totalGrams: number;
}

/**
 * True when the candidate landing does not duplicate an existing OPEN one:
 * same species (the caller queries per species), same Ecuador day and same
 * total grams. Closed lots are not passed in — they no longer sell.
 */
export function canCreateLot(
  existingOpenLots: readonly ExistingLot[],
  candidate: ExistingLot,
): boolean {
  const day = ecuadorDayKey(candidate.landedAt);
  return !existingOpenLots.some(
    (lot) => lot.totalGrams === candidate.totalGrams && ecuadorDayKey(lot.landedAt) === day,
  );
}

/**
 * Builds the row to insert: a landing always starts OPEN with nothing
 * reserved, so `reservedGrams <= totalGrams` holds by construction at
 * creation time (the panel never raises `reservedGrams`, and there is no edit
 * that could lower `totalGrams` under it).
 */
export function toLotInsert(values: LotValues, speciesId: string): LotInsert {
  return {
    speciesId,
    landedAt: values.landedAt,
    totalGrams: values.totalGrams,
    reservedGrams: 0,
    status: "OPEN",
    notes: values.notes,
  };
}

