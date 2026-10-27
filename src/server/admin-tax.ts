// Tax (IVA) persistence for the admin panel. Thin data access only: read the
// append-only history and append one row. No parsing, no messages, no rules
// here — those live in the pure `@/lib/admin-tax`.
//
// Two invariants are enforced by construction instead of by trust:
// - There is no update and no delete: `tax_rate` is append-only history (S3)
//   and the module exposes no way to rewrite a rate an order was quoted with.
// - The insert is a plain `create`: the unique `(category, effectiveFrom)`
//   constraint is the last word on duplicates, so the Server Action turns its
//   violation into a field message instead of trusting its own pre-check.

import "server-only";

import { db } from "@/lib/db";
import type { TaxRateValues } from "@/lib/admin-tax";
import type { VatCategory } from "@/domain/pricing";

/** One row of the append-only rate history, as the panel renders it. */
export interface AdminTaxRateRow {
  id: string;
  category: VatCategory;
  rateBps: number;
  effectiveFrom: Date;
  note: string | null;
}

/**
 * The whole rate history, grouped by category and newest first inside each
 * category. The panel needs every row (S7): the in-force table, the scheduled
 * row and the history all come from this one read, and the pure rules decide
 * which is which at the request instant.
 */
export async function listTaxRatesForAdmin(): Promise<AdminTaxRateRow[]> {
  return db.taxRate.findMany({
    select: { id: true, category: true, rateBps: true, effectiveFrom: true, note: true },
    orderBy: [{ category: "asc" }, { effectiveFrom: "desc" }],
  });
}

/** Appends one rate to the history. Never updates and never deletes (S3). */
export async function insertTaxRateRecord(values: TaxRateValues): Promise<void> {
  await db.taxRate.create({
    data: {
      category: values.category,
      rateBps: values.rateBps,
      effectiveFrom: values.effectiveFrom,
      note: values.note,
    },
  });
}

/**
 * True when the database refused a write because of a unique constraint. Shared
 * with the species panel (one definition, not a copy): the pre-check and the
 * insert are not atomic, so a concurrent operator can take the date in between.
 */
export { isUniqueViolation } from "@/server/admin-species";
