"use server";

// Create-species Server Action (A5). The form posts raw strings; everything
// that decides whether a species exists is re-checked here: session, every
// field, the slug uniqueness and the tier set the new species will quote with.
//
// Decision (documented): the create form includes the tier editor, so a CUSTOM
// species is created WITH its tiers in one transaction. Creating it with an
// empty tier set would leave a species the quote engine refuses to price
// (`CUSTOM_TIERS_REQUIRED`) between one visit and the next.

import { redirect } from "next/navigation";

import { assertAdminSessionOrRedirect } from "@/lib/admin-actions";
import {
  parseSpeciesCreateForm,
  parseTierRows,
  speciesTierFormError,
  zipTierColumns,
  type SpeciesCreateFormState,
  type SpeciesCreateRawFields,
} from "@/lib/admin-species";
import { createSpeciesRecord, isSlugTaken, isUniqueViolation } from "@/server/admin-species";

/** Spanish message for a slug another species already owns. */
const SLUG_TAKEN_MESSAGE = "Ese slug ya existe. Elige otro.";

/** Reads one submitted text field, `""` when absent (files included). */
function readTextField(formData: FormData, field: string): string {
  const value = formData.get(field);
  return typeof value === "string" ? value : "";
}

/** Every submitted value of a repeated field, as strings. */
function readTextList(formData: FormData, field: string): string[] {
  return formData
    .getAll(field)
    .filter((value): value is string => typeof value === "string");
}

/** Raw strings of the create form, in the shape the pure parser expects. */
function readCreateFields(formData: FormData): SpeciesCreateRawFields {
  return {
    slug: readTextField(formData, "slug"),
    name: readTextField(formData, "name"),
    description: readTextField(formData, "description"),
    pricePerKg: readTextField(formData, "pricePerKg"),
    minOrderKg: readTextField(formData, "minOrderKg"),
    orderStepKg: readTextField(formData, "orderStepKg"),
    discountPolicy: readTextField(formData, "discountPolicy"),
    vatCategory: readTextField(formData, "vatCategory"),
    isSeasonal: readTextField(formData, "isSeasonal"),
  };
}

export async function createSpecies(
  _previous: SpeciesCreateFormState,
  formData: FormData,
): Promise<SpeciesCreateFormState> {
  await assertAdminSessionOrRedirect();

  const raw = readCreateFields(formData);

  const parsed = parseSpeciesCreateForm(raw);
  if (!parsed.ok) {
    return { fieldErrors: parsed.fieldErrors, raw };
  }

  // Tiers are only meaningful for a CUSTOM species; for any other policy the
  // submitted rows are ignored instead of producing an error the operator
  // cannot see (the editor is hidden then).
  const isCustom = parsed.values.discountPolicy === "CUSTOM";
  const tiersResult = isCustom
    ? parseTierRows(
        zipTierColumns(
          readTextList(formData, "tierMinTotalKg"),
          readTextList(formData, "tierDiscountPercent"),
        ),
      )
    : ({ ok: true, tiers: [] } as const);
  if (!tiersResult.ok) {
    return {
      fieldErrors: tiersResult.fieldErrors,
      formError: tiersResult.formError,
      raw,
    };
  }

  const couplingError = speciesTierFormError({
    discountPolicy: parsed.values.discountPolicy,
    tiers: tiersResult.tiers,
  });
  if (couplingError !== null) {
    return { fieldErrors: {}, formError: couplingError, raw };
  }

  if (await isSlugTaken(parsed.values.slug)) {
    return { fieldErrors: { slug: SLUG_TAKEN_MESSAGE }, raw };
  }

  try {
    await createSpeciesRecord(parsed.values, tiersResult.tiers);
  } catch (error) {
    if (isUniqueViolation(error)) {
      return { fieldErrors: { slug: SLUG_TAKEN_MESSAGE }, raw };
    }
    throw error;
  }

  // Outside any try/catch: `redirect` throws the framework's control signal.
  redirect(`/admin/species/${parsed.values.slug}?created=1`);
}
