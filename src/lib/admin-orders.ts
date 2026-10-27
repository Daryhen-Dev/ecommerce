// Pure admin logic for orders (pedidos): the manual status transitions the
// panel offers, the Spanish labels of the states and transitions, and the
// timestamp a transition writes.
//
// No React, no `server-only`, no Prisma and no clock access: the caller passes
// the request instant in, and every rule is unit-tested. The Server Action is
// the only caller that touches the database or the clock.
//
// The panel is read-only except for these two transitions, so this module is
// the whole rule set of the section: a transition refused here must never
// reach the database, and the database guard (`updateMany` on the status the
// page showed) is the second line of defence, not the first.
//
// Home: the order lifecycle is domain knowledge, not panel knowledge. When the
// checkout flow lands it belongs in `src/domain/order.ts` next to the pricing
// rules; it lives here because the admin panel is the only caller today and the
// domain layer only accepts rules the storefront already enforces.

/** The four states an order can be in, mirroring the database enum. */
export type OrderStatus = "PENDING_PAYMENT" | "PAID" | "CANCELLED" | "PICKED_UP";

/** Every status, in the order the panel documents them. */
export const ORDER_STATUSES: readonly OrderStatus[] = [
  "PENDING_PAYMENT",
  "PAID",
  "CANCELLED",
  "PICKED_UP",
];

/**
 * The status a manual transition may ask for. `PENDING_PAYMENT` and
 * `PICKED_UP` are deliberately absent: an order is never un-paid from the
 * panel, and pickup is recorded at the airport counter, not in this screen.
 */
export const ORDER_TRANSITION_TARGETS = ["PAID", "CANCELLED"] as const;

/** One status the panel can transition to. */
export type OrderTransitionTarget = (typeof ORDER_TRANSITION_TARGETS)[number];

/**
 * Spanish refusal shared by every illegal transition. It is deliberately one
 * sentence and not a per-pair explanation: the operator does not need to know
 * which rule fired, only that the state they see is stale or the change is not
 * allowed.
 */
export const ORDER_TRANSITION_MESSAGE =
  "Ese pedido ya no admite ese cambio de estado.";

/** Spanish labels of the order states, never the raw database value. */
const ORDER_STATUS_LABELS: Record<OrderStatus, string> = {
  PENDING_PAYMENT: "Pendiente de pago",
  PAID: "Pagado",
  CANCELLED: "Cancelado",
  PICKED_UP: "Retirado",
};

/** Spanish labels of the transition buttons. */
const ORDER_TRANSITION_LABELS: Record<OrderTransitionTarget, string> = {
  PAID: "Marcar pagado",
  CANCELLED: "Cancelar",
};

/** Spanish label of one order status. */
export function orderStatusLabel(status: OrderStatus): string {
  return ORDER_STATUS_LABELS[status];
}

/** Spanish label of the button that asks for one transition. */
export function orderTransitionLabel(target: OrderTransitionTarget): string {
  return ORDER_TRANSITION_LABELS[target];
}

/**
 * True when a manually requested status change is allowed.
 *
 * - From PENDING_PAYMENT the operator may confirm the payment or cancel the
 *   order: the customer has not paid yet, so both are plain bookkeeping.
 * - Repeating the current status is a no-op, not a change: it is allowed so a
 *   rejected request cannot talk the UI into an error state it cannot fix.
 * - Everything else is refused. In particular a PAID order is not cancellable
 *   from the panel: money already changed hands, and a refund is a business
 *   decision with its own flow, not a status click.
 */
export function canTransition(from: OrderStatus, to: OrderStatus): boolean {
  if (from === to) {
    return true;
  }
  return from === "PENDING_PAYMENT" && (to === "PAID" || to === "CANCELLED");
}

/**
 * Spanish message for a transition the panel refuses, or null when it is
 * allowed. The form renders the message as an alert instead of sending the
 * request.
 */
export function transitionFormError(
  from: OrderStatus,
  to: OrderStatus,
): string | null {
  return canTransition(from, to) ? null : ORDER_TRANSITION_MESSAGE;
}

/**
 * The `paidAt` value a transition writes: the payment instant when the order
 * becomes PAID, and null for every other status (a cancelled order was never
 * paid, and a no-op must not re-stamp an existing payment).
 */
export function paidAtForTransition(input: {
  next: OrderStatus;
  now: Date;
}): Date | null {
  return input.next === "PAID" ? input.now : null;
}

/**
 * Reads a submitted status, or null when the value is not a known status.
 * Both the status the page showed and the requested one are submitted as
 * strings, so the action validates them here instead of trusting the form.
 */
export function parseOrderStatusField(raw: string): OrderStatus | null {
  return (ORDER_STATUSES as readonly string[]).includes(raw)
    ? (raw as OrderStatus)
    : null;
}

/** True when a submitted value is a transition the panel offers a button for. */
export function isTransitionTarget(raw: string): raw is OrderTransitionTarget {
  return (ORDER_TRANSITION_TARGETS as readonly string[]).includes(raw);
}

/**
 * Shipment the page shows when the URL carries none: the newest departure that
 * already carries orders, so the section is never empty while there is
 * something to see. Falls back to the newest shipment when nobody has ordered
 * yet, and to null only when there is no shipment at all.
 *
 * The caller passes the rows in display order (newest departure first), which
 * is what makes "the newest" a first-match instead of a sort here.
 */
export function pickDefaultShipmentId(
  shipments: readonly { id: string; orderCount: number }[],
): string | null {
  const withOrders = shipments.find((shipment) => shipment.orderCount > 0);
  return (withOrders ?? shipments[0])?.id ?? null;
}

/** What the transition form keeps between submissions. */
export type OrderTransitionState = {
  formError?: string;
};

/** Initial state of the transition form, before the first submission. */
export const EMPTY_ORDER_TRANSITION_STATE: OrderTransitionState = {};
