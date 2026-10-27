"use server";

// Create-landing Server Action (A3). The form posts raw strings; everything
// that decides whether a landing exists is re-checked here: session, every
// field, the active species list, and the duplicate rule.

import { redirect } from "next/navigation";

import { assertAdminSessionOrRedirect } from "@/lib/admin-actions";
import {
  canCreateLot,
  LOT_DUPLICATE_MESSAGE,
  parseLotForm,
  toLotInsert,
  type LotFormState,
  type LotRawFields,
} from "@/lib/admin-lots";
import {
  createLotRecord,
  listSpeciesOptions,
  openLotsNearLandedAt,
} from "@/server/admin-lots";

/** Reads one submitted text field, `""` when absent (files included). */
function readTextField(formData: FormData, field: string): string {
  const value = formData.get(field);
  return typeof value === "string" ? value : "";
}

/** Raw strings of the create form, in the shape the pure parser expects. */
function readLotFields(formData: FormData): LotRawFields {
  return {
    species: readTextField(formData, "species"),
    landedAt: readTextField(formData, "landedAt"),
    totalKg: readTextField(formData, "totalKg"),
    notes: readTextField(formData, "notes"),
  };
}

export async function createLot(
  _previous: LotFormState,
  formData: FormData,
): Promise<LotFormState> {
  await assertAdminSessionOrRedirect();

  const raw = readLotFields(formData);

  // The select is validated against the CURRENT active species list, never
  // against the options the browser received.
  const species = await listSpeciesOptions();
  const parsed = parseLotForm(raw, { speciesSlugs: species.map((s) => s.slug) });
  if (!parsed.ok) {
    return { fieldErrors: parsed.fieldErrors, raw };
  }

  const selected = species.find((option) => option.slug === parsed.values.speciesSlug);
  if (selected === undefined) {
    return {
      fieldErrors: {},
      formError: "Esa especie ya no está activa. Elige otra.",
      raw,
    };
  }

  const existingOpenLots = await openLotsNearLandedAt(
    selected.id,
    parsed.values.landedAt,
  );
  if (!canCreateLot(existingOpenLots, parsed.values)) {
    return { fieldErrors: {}, formError: LOT_DUPLICATE_MESSAGE, raw };
  }

  await createLotRecord(toLotInsert(parsed.values, selected.id));
  // Outside any try/catch: `redirect` throws the framework's control signal.
  redirect("/admin/lots?created=1");
}
