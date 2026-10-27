// Shipment ordering window and lifecycle phase. A shipment is orderable
// until its cutoff and always departs (no minimum, no cancel). Pure domain:
// no framework, database, I/O or clock access; the instant is a parameter;
// inputs are never mutated.

export interface ShipmentWindow {
  /** Last moment to order (inclusive). */
  orderCutoffAt: Date;
  departsAt: Date;
  estimatedArrivalAt: Date;
  /** Pickup is the customer's responsibility at the destination airport. */
  pickupStartsAt: Date;
  pickupEndsAt: Date;
}

export type ShipmentPhase = "ORDERING" | "IN_FLIGHT" | "PICKUP" | "COMPLETED";

export type ShipmentErrorCode = "INVALID_SHIPMENT_WINDOW" | "INVALID_INSTANT";

export class ShipmentError extends Error {
  readonly code: ShipmentErrorCode;

  constructor(code: ShipmentErrorCode, message: string) {
    super(message);
    this.name = "ShipmentError";
    this.code = code;
  }
}

function isValidDate(value: unknown): value is Date {
  return value instanceof Date && !Number.isNaN(value.getTime());
}

/**
 * Validates the window shape (mirrors the DB CHECK constraints):
 * `orderCutoffAt <= departsAt < estimatedArrivalAt` and
 * `pickupStartsAt < pickupEndsAt`. Returns the same window object; nothing
 * is copied or mutated. Note: no invariant ties pickup to the arrival
 * estimate, so a window whose pickup ends before the arrival estimate is
 * valid and simply reads COMPLETED from `pickupEndsAt` on.
 */
export function parseShipmentWindow(raw: unknown): ShipmentWindow {
  if (typeof raw !== "object" || raw === null) {
    throw new ShipmentError("INVALID_SHIPMENT_WINDOW", "shipment window must be an object");
  }
  const window = raw as ShipmentWindow;
  const fields: Array<[string, unknown]> = [
    ["orderCutoffAt", window.orderCutoffAt],
    ["departsAt", window.departsAt],
    ["estimatedArrivalAt", window.estimatedArrivalAt],
    ["pickupStartsAt", window.pickupStartsAt],
    ["pickupEndsAt", window.pickupEndsAt],
  ];
  for (const [name, value] of fields) {
    if (!isValidDate(value)) {
      throw new ShipmentError("INVALID_SHIPMENT_WINDOW", `${name} must be a valid Date, got ${String(value)}`);
    }
  }
  if (window.orderCutoffAt.getTime() > window.departsAt.getTime()) {
    throw new ShipmentError("INVALID_SHIPMENT_WINDOW", `orderCutoffAt (${window.orderCutoffAt.toISOString()}) must not be later than departsAt (${window.departsAt.toISOString()})`);
  }
  if (window.departsAt.getTime() >= window.estimatedArrivalAt.getTime()) {
    throw new ShipmentError("INVALID_SHIPMENT_WINDOW", `departsAt (${window.departsAt.toISOString()}) must be earlier than estimatedArrivalAt (${window.estimatedArrivalAt.toISOString()})`);
  }
  if (window.pickupStartsAt.getTime() >= window.pickupEndsAt.getTime()) {
    throw new ShipmentError("INVALID_SHIPMENT_WINDOW", `pickupStartsAt (${window.pickupStartsAt.toISOString()}) must be earlier than pickupEndsAt (${window.pickupEndsAt.toISOString()})`);
  }
  return window;
}

/**
 * True while the order can still be placed at `at`: the cutoff is inclusive
 * (`at <= orderCutoffAt`) and a defensive departure guard keeps ordering
 * closed from the departure instant on (`at < departsAt`), so a shipment
 * whose cutoff equals its departure instant closes exactly at both.
 */
export function canOrder(input: ShipmentWindow, at: Date): boolean {
  const window = parseShipmentWindow(input);
  if (!isValidDate(at)) {
    throw new ShipmentError("INVALID_INSTANT", `at must be a valid Date, got ${String(at)}`);
  }
  const instant = at.getTime();
  return instant <= window.orderCutoffAt.getTime() && instant < window.departsAt.getTime();
}

/**
 * The lifecycle phase at `at`. Gaps between phases return the EARLIEST next
 * phase: after the cutoff but before departure reads IN_FLIGHT, and after
 * the arrival estimate but before pickupStartsAt reads PICKUP (the pickup
 * window is the customer's responsibility and typically opens right after
 * arrival). COMPLETED starts at pickupEndsAt; nothing comes after it. No
 * extra states exist by design.
 */
export function shipmentPhase(input: ShipmentWindow, at: Date): ShipmentPhase {
  const window = parseShipmentWindow(input);
  if (!isValidDate(at)) {
    throw new ShipmentError("INVALID_INSTANT", `at must be a valid Date, got ${String(at)}`);
  }
  const instant = at.getTime();
  if (instant <= window.orderCutoffAt.getTime()) {
    return "ORDERING";
  }
  if (instant >= window.pickupEndsAt.getTime()) {
    return "COMPLETED";
  }
  if (instant >= window.estimatedArrivalAt.getTime()) {
    return "PICKUP";
  }
  return "IN_FLIGHT";
}
