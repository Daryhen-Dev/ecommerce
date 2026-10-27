"use server";

// Server Actions for the landings (desembarques) section: register one and
// close one. Both re-verify the admin session before touching the database,
// re-validate every submitted field, and use the shared pure logic for the
// rules.

import { revalidatePath } from "next/cache";

import { assertAdminSessionOrRedirect } from "@/lib/admin-actions";
import { closeLotById } from "@/server/admin-lots";

/** Reads one submitted text field, `""` when absent (files included). */
function readTextField(formData: FormData, field: string): string {
  const value = formData.get(field);
  return typeof value === "string" ? value : "";
}

/**
 * Closes one landing from its row button.
 *
 * Choice (documented): no confirmation dialog and no extra step. Closing is
 * idempotent and never destructive — it only flips an OPEN row to CLOSED,
 * never touches `reservedGrams`, and an accidental close is undone by
 * registering a new landing. A modal would add JavaScript and a second
 * confirmation for an action the cooperative does several times a day.
 *
 * The action is a plain Server Action on a `<form>`: no client state is
 * needed, so the list page stays a Server Component.
 */
export async function closeLotAction(formData: FormData): Promise<void> {
  await assertAdminSessionOrRedirect();

  const id = readTextField(formData, "id");
  if (id === "") {
    return;
  }

  // A stale row (already CLOSED or deleted meanwhile) is not an error: the
  // revalidated page shows the real state.
  await closeLotById(id);
  revalidatePath("/admin/lots");
}
