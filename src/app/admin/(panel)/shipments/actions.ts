"use server";

// Server Actions for the flights (vuelos) section: schedule one and close one.
// Both re-verify the admin session, re-validate every submitted field and use
// the shared domain window rules, so the storefront and the panel can never
// disagree about whether a flight accepts orders.

import { revalidatePath } from "next/cache";

import { assertAdminSessionOrRedirect } from "@/lib/admin-actions";
import { closeShipmentById } from "@/server/admin-shipments";

/** Reads one submitted text field, `""` when absent (files included). */
function readTextField(formData: FormData, field: string): string {
  const value = formData.get(field);
  return typeof value === "string" ? value : "";
}

/**
 * Closes one SCHEDULED flight from its row button.
 *
 * Choice (documented): no confirmation dialog, same as closing a landing.
 * Closing is idempotent, only SCHEDULED rows are touched (a flight already in
 * transit or completed is left alone), and the effect — the flight stops
 * accepting orders — is immediate and visible in the list.
 */
export async function closeShipmentAction(formData: FormData): Promise<void> {
  await assertAdminSessionOrRedirect();

  const id = readTextField(formData, "id");
  if (id === "") {
    return;
  }

  await closeShipmentById(id);
  revalidatePath("/admin/shipments");
}
