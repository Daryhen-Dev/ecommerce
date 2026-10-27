"use server";

// Server Action that registers one VAT rate change (S2). It re-verifies the
// admin session before touching the database, re-validates every submitted
// field, applies the append-only date rules against the stored history, and
// only then appends the row.
//
// It never updates or deletes: a correction is a new row from now on, so a rate
// an order was already quoted with cannot be rewritten (S3).

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { assertAdminSessionOrRedirect } from "@/lib/admin-actions";
import {
  DUPLICATE_RATE_DATE_MESSAGE,
  parseTaxRateForm,
  taxRateDateError,
  type TaxRateFormState,
  type TaxRateRawFields,
} from "@/lib/admin-tax";
import {
  insertTaxRateRecord,
  isUniqueViolation,
  listTaxRatesForAdmin,
} from "@/server/admin-tax";

/** Reads one submitted text field, `""` when absent (files included). */
function readTextField(formData: FormData, field: string): string {
  const value = formData.get(field);
  return typeof value === "string" ? value : "";
}

/** Raw strings of the register form, in the shape the pure parser expects. */
function readRateFields(formData: FormData): TaxRateRawFields {
  return {
    category: readTextField(formData, "category"),
    ratePercent: readTextField(formData, "ratePercent"),
    effectiveFrom: readTextField(formData, "effectiveFrom"),
    note: readTextField(formData, "note"),
  };
}

/**
 * Appends a rate change to the history.
 *
 * A refusal returns the state so the form re-renders with the Spanish message
 * next to the date field (or the field that failed); a success redirects so the
 * page shows the stored history, not the operator's previous submission.
 */
export async function registerTaxRate(
  _previous: TaxRateFormState,
  formData: FormData,
): Promise<TaxRateFormState> {
  await assertAdminSessionOrRedirect();

  const raw = readRateFields(formData);

  const parsed = parseTaxRateForm(raw);
  if (!parsed.ok) {
    return { fieldErrors: parsed.fieldErrors, raw };
  }

  // The append-only rules need the stored history: no duplicate
  // (category, effectiveFrom), and strictly later than the latest row of the
  // category. Backdating is refused because an append-only table cannot
  // retract the row it would insert (S5).
  const history = await listTaxRatesForAdmin();
  const dateError = taxRateDateError({
    category: parsed.values.category,
    effectiveFrom: parsed.values.effectiveFrom,
    history,
  });
  if (dateError !== null) {
    return { fieldErrors: { effectiveFrom: dateError }, raw };
  }

  try {
    await insertTaxRateRecord(parsed.values);
  } catch (error) {
    // The pre-check above is not atomic: another operator can append the same
    // date in between. The unique constraint wins and the form says why.
    if (isUniqueViolation(error)) {
      return { fieldErrors: { effectiveFrom: DUPLICATE_RATE_DATE_MESSAGE }, raw };
    }
    throw error;
  }

  revalidatePath("/admin/tax");
  // Outside any try/catch: `redirect` throws the framework's control signal.
  redirect("/admin/tax?created=1");
}
