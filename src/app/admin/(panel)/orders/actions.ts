"use server";

// Server Actions of the orders (pedidos) section (A6): the two manual status
// transitions the panel offers, mark paid and cancel.
//
// Everything else about an order is read-only: no action here edits items,
// customer data or amounts, so the only write path is a guarded status change.
// The action re-verifies the admin session first, then re-validates both the
// status the page showed and the requested one against the pure rules, and
// only then touches the database.

import { revalidatePath } from "next/cache";

import { assertAdminSessionOrRedirect } from "@/lib/admin-actions";
import {
  ORDER_TRANSITION_MESSAGE,
  isTransitionTarget,
  parseOrderStatusField,
  paidAtForTransition,
  transitionFormError,
  type OrderTransitionState,
} from "@/lib/admin-orders";
import { applyOrderStatusChange } from "@/server/admin-orders";

/** Reads one submitted text field, `""` when absent (files included). */
function readTextField(formData: FormData, field: string): string {
  const value = formData.get(field);
  return typeof value === "string" ? value : "";
}

/**
 * Marks one order paid or cancels it.
 *
 * The submitted `expectedStatus` is the status the page rendered: the update
 * matches only that row state, so a stale page can never flip an order twice,
 * cancel a paid one, or pay a cancelled one. A request that yields no update
 * (the order vanished, or somebody changed it in another tab) is refused with
 * the same Spanish sentence instead of pretending the click worked.
 *
 * Failure is returned as form state so the row renders a form alert; success
 * returns empty state and lets the revalidated page show the stored status.
 */
export async function transitionOrder(
  _previous: OrderTransitionState,
  formData: FormData,
): Promise<OrderTransitionState> {
  await assertAdminSessionOrRedirect();

  const orderId = readTextField(formData, "orderId");
  const expected = parseOrderStatusField(readTextField(formData, "expectedStatus"));
  const requested = readTextField(formData, "nextStatus");

  if (orderId === "" || expected === null || !isTransitionTarget(requested)) {
    return { formError: ORDER_TRANSITION_MESSAGE };
  }

  const refusal = transitionFormError(expected, requested);
  if (refusal !== null) {
    return { formError: refusal };
  }

  // Repeating the current status is a no-op, never a write: re-stamping
  // `paidAt` on an already paid order would silently rewrite the payment
  // instant the cooperative reconciled against.
  if (requested === expected) {
    return {};
  }

  const applied = await applyOrderStatusChange({
    id: orderId,
    expected,
    next: requested,
    paidAt: paidAtForTransition({ next: requested, now: new Date() }),
  });
  if (!applied) {
    return { formError: ORDER_TRANSITION_MESSAGE };
  }

  revalidatePath("/admin/orders");
  return {};
}
