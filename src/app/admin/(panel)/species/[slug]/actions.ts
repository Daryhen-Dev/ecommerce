"use server";

// Server Actions of one species (A5): edit its configuration and tiers, and
// add or remove season windows. Every action re-verifies the admin session
// before touching the database and re-validates every submitted field.
//
// The species is identified by its slug (immutable, taken from the URL) and
// resolved server-side to its id: the browser never chooses the row it edits,
// and a stale page cannot write to a different species than the one it shows.

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { assertAdminSessionOrRedirect } from "@/lib/admin-actions";
import {
  EMPTY_SEASON_RAW,
  parseSeasonWindowForm,
  parseSpeciesEditForm,
  parseTierRows,
  speciesTierFormError,
  zipTierColumns,
  type SeasonFormState,
  type SpeciesEditRawFields,
  type SpeciesFormState,
} from "@/lib/admin-species";
import {
  addSeasonRecord,
  deleteSeasonRecord,
  getSpeciesForAdmin,
  updateSpeciesRecord,
} from "@/server/admin-species";

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

/** Raw strings of the edit form, in the shape the pure parser expects. */
function readEditFields(formData: FormData): SpeciesEditRawFields {
  return {
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

/** Message shown when the species of the form no longer exists. */
const SPECIES_GONE_MESSAGE =
  "Esa especie ya no existe. Vuelve a la lista de especies.";

/**
 * Saves the configuration of one species and replaces its tier set.
 *
 * A seasonal species may be saved with no window: that is a real configuration
 * ("not on sale yet"), and the page states it. Refusing the save would trap the
 * operator on the form when they switch a species to seasonal before the season
 * is announced.
 */
export async function updateSpecies(
  _previous: SpeciesFormState,
  formData: FormData,
): Promise<SpeciesFormState> {
  await assertAdminSessionOrRedirect();

  const slug = readTextField(formData, "speciesSlug");
  const raw = readEditFields(formData);

  const parsed = parseSpeciesEditForm(raw);
  if (!parsed.ok) {
    return { fieldErrors: parsed.fieldErrors, raw };
  }

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

  const species = await getSpeciesForAdmin(slug);
  if (species === null) {
    return { fieldErrors: {}, formError: SPECIES_GONE_MESSAGE, raw };
  }

  await updateSpeciesRecord(species.id, parsed.values, tiersResult.tiers);
  revalidatePath(`/admin/species/${slug}`);
  revalidatePath("/admin/species");
  // Outside any try/catch: `redirect` throws the framework's control signal.
  // The success path navigates instead of returning state, so the page can
  // announce the save and the operator sees the stored values, not their
  // previous submission.
  redirect(`/admin/species/${slug}?saved=1`);
}

/**
 * Adds one season window to a seasonal species. The window is validated by the
 * season domain before it is stored, so the storefront never has to interpret
 * an incoherent season.
 */
export async function addSeason(
  _previous: SeasonFormState,
  formData: FormData,
): Promise<SeasonFormState> {
  await assertAdminSessionOrRedirect();

  const slug = readTextField(formData, "speciesSlug");
  const raw = {
    startsAt: readTextField(formData, "startsAt"),
    endsAt: readTextField(formData, "endsAt"),
  };

  const parsed = parseSeasonWindowForm(raw);
  if (!parsed.ok) {
    return { fieldErrors: parsed.fieldErrors, raw };
  }

  const species = await getSpeciesForAdmin(slug);
  if (species === null) {
    return { fieldErrors: {}, formError: SPECIES_GONE_MESSAGE, raw };
  }
  if (!species.isSeasonal) {
    return {
      fieldErrors: {},
      formError:
        "Esta especie no es de temporada. Marca la casilla y guarda los cambios antes de agregar temporadas.",
      raw,
    };
  }

  await addSeasonRecord(species.id, parsed.window);
  revalidatePath(`/admin/species/${slug}`);
  revalidatePath("/admin/species");
  return { fieldErrors: {}, raw: EMPTY_SEASON_RAW };
}

/**
 * Removes one season window. Removal is allowed at any time: it can only make a
 * species unavailable, never oversell, and the page shows the consequence (a
 * seasonal species with no window cannot be sold).
 */
export async function removeSeason(formData: FormData): Promise<void> {
  await assertAdminSessionOrRedirect();

  const slug = readTextField(formData, "speciesSlug");
  const seasonId = readTextField(formData, "seasonId");
  if (slug === "" || seasonId === "") {
    return;
  }

  const species = await getSpeciesForAdmin(slug);
  if (species === null) {
    return;
  }

  // A stale row (already removed) is not an error: the revalidated page shows
  // the real state. The scope by speciesId stops a tampered id from deleting
  // another species's window.
  await deleteSeasonRecord(species.id, seasonId);
  revalidatePath(`/admin/species/${slug}`);
  revalidatePath("/admin/species");
}
