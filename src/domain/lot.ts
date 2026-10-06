// Lot reservation: one landing of one species, sold by the kilogram until
// its grams are reserved or the lot is closed. Pure domain: no framework,
// database, I/O or clock access; states are never mutated, every operation
// returns a NEW state. The invariants here mirror the DB guarantees
// (`total_grams > 0`, `reserved_grams >= 0`, `reserved_grams <= total_grams`,
// status OPEN/CLOSED).

export type LotStatus = "OPEN" | "CLOSED";

export interface LotState {
  /** Total landing weight in grams (positive safe integer). */
  totalGrams: number;
  /** Grams already reserved by paid orders (non-negative safe integer <= totalGrams). */
  reservedGrams: number;
  status: LotStatus;
}

export type LotErrorCode =
  | "LOT_CLOSED"
  | "INSUFFICIENT_AVAILABLE"
  | "INVALID_GRAMS"
  | "RELEASE_EXCEEDS_RESERVED"
  | "LOT_STATE_INVALID";

export class LotError extends Error {
  readonly code: LotErrorCode;

  constructor(code: LotErrorCode, message: string) {
    super(message);
    this.name = "LotError";
    this.code = code;
  }
}

const LOT_STATUSES: readonly LotStatus[] = ["OPEN", "CLOSED"];

/**
 * Shared guard: validates the shape of a lot state against the invariants
 * the database also enforces. Every exported function funnels through it,
 * so corrupt input fails fast with LOT_STATE_INVALID instead of producing
 * a silently broken result.
 */
function parseLotState(lot: LotState): LotState {
  if (typeof lot !== "object" || lot === null) {
    throw new LotError("LOT_STATE_INVALID", "lot must be an object");
  }
  if (!Number.isSafeInteger(lot.totalGrams) || lot.totalGrams <= 0) {
    throw new LotError("LOT_STATE_INVALID", `totalGrams must be a positive safe integer, got ${String(lot.totalGrams)}`);
  }
  if (!Number.isSafeInteger(lot.reservedGrams) || lot.reservedGrams < 0 || lot.reservedGrams > lot.totalGrams) {
    throw new LotError(
      "LOT_STATE_INVALID",
      `reservedGrams must be a safe integer in 0..${lot.totalGrams}, got ${String(lot.reservedGrams)}`,
    );
  }
  if (!LOT_STATUSES.includes(lot.status)) {
    throw new LotError("LOT_STATE_INVALID", `status must be OPEN or CLOSED, got ${String(lot.status)}`);
  }
  return lot;
}

/** Valid reservation/release amounts: positive safe integers. */
function isPositiveSafeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0;
}

/** total − reserved, never negative; guarded against corrupt states. */
export function availableGrams(lot: LotState): number {
  parseLotState(lot);
  return lot.totalGrams - lot.reservedGrams;
}

/**
 * True iff the lot is OPEN and `reservedGrams + grams <= totalGrams` with a
 * positive integer amount. Invalid amounts return false instead of throwing:
 * this is a cheap predicate; the throwing validation lives in `reserve`.
 */
export function canReserve(lot: LotState, grams: number): boolean {
  parseLotState(lot);
  return (
    lot.status === "OPEN" &&
    isPositiveSafeInteger(grams) &&
    lot.reservedGrams + grams <= lot.totalGrams
  );
}

/**
 * Returns a NEW state with `reservedGrams` increased by `grams`; the input
 * state is never mutated. Throws LOT_CLOSED on a closed lot,
 * INSUFFICIENT_AVAILABLE when the amount exceeds the free grams and
 * INVALID_GRAMS for zero, negative, non-integer or unsafe amounts.
 */
export function reserve(lot: LotState, grams: number): LotState {
  parseLotState(lot);
  if (!isPositiveSafeInteger(grams)) {
    throw new LotError("INVALID_GRAMS", `grams must be a positive safe integer, got ${String(grams)}`);
  }
  if (lot.status === "CLOSED") {
    throw new LotError("LOT_CLOSED", "cannot reserve from a CLOSED lot");
  }
  if (lot.reservedGrams + grams > lot.totalGrams) {
    throw new LotError(
      "INSUFFICIENT_AVAILABLE",
      `cannot reserve ${grams} g: only ${lot.totalGrams - lot.reservedGrams} g available in the lot`,
    );
  }
  return { ...lot, reservedGrams: lot.reservedGrams + grams };
}

/**
 * Returns a NEW state with `reservedGrams` decreased by `grams` (an order
 * was cancelled or rejected); the input state is never mutated and the
 * result never goes below zero. Product choice (documented): releasing on a
 * CLOSED lot is still valid — an order cancelled after the lot closed must
 * get its grams back — so only the amount is validated here. Throws
 * INVALID_GRAMS for zero, negative, non-integer or unsafe amounts and
 * RELEASE_EXCEEDS_RESERVED when releasing more than is reserved.
 */
export function release(lot: LotState, grams: number): LotState {
  parseLotState(lot);
  if (!isPositiveSafeInteger(grams)) {
    throw new LotError("INVALID_GRAMS", `grams must be a positive safe integer, got ${String(grams)}`);
  }
  if (grams > lot.reservedGrams) {
    throw new LotError(
      "RELEASE_EXCEEDS_RESERVED",
      `cannot release ${grams} g: only ${lot.reservedGrams} g are reserved in the lot`,
    );
  }
  return { ...lot, reservedGrams: lot.reservedGrams - grams };
}

/** Returns a NEW closed state; closing never changes reservedGrams. Idempotent. */
export function closeLot(lot: LotState): LotState {
  parseLotState(lot);
  return { ...lot, status: "CLOSED" };
}

/** Why an order cannot be fulfilled against a lot, when it cannot be. */
export type RejectionReason =
  | "CLOSED"
  | "INSUFFICIENT_AVAILABLE"
  | "BELOW_MINIMUM"
  | "OFF_STEP"
  | "INVALID";

/** Owner-configurable defaults (confirmed assumption: min 1 kg, step 0.5 kg). */
const DEFAULT_MIN_ORDER_GRAMS = 1000;
const DEFAULT_ORDER_STEP_GRAMS = 500;

export interface CanFulfillOrderOptions {
  minOrderGrams?: number;
  orderStepGrams?: number;
}

/**
 * Order-level check combining availability with the per-species minimum
 * order and step (only when `opts` is given; omitted fields fall back to
 * the owner defaults). Returns true when the order is acceptable, otherwise
 * the first rejection reason; invalid amounts yield "INVALID" instead of
 * throwing so callers can map the reason to a field error.
 */
export function canFulfillOrder(
  lot: LotState,
  grams: number,
  opts?: CanFulfillOrderOptions,
): true | RejectionReason {
  parseLotState(lot);
  if (!isPositiveSafeInteger(grams)) {
    return "INVALID";
  }
  if (lot.status === "CLOSED") {
    return "CLOSED";
  }
  if (lot.reservedGrams + grams > lot.totalGrams) {
    return "INSUFFICIENT_AVAILABLE";
  }
  if (opts !== undefined) {
    const minOrderGrams = opts.minOrderGrams ?? DEFAULT_MIN_ORDER_GRAMS;
    const orderStepGrams = opts.orderStepGrams ?? DEFAULT_ORDER_STEP_GRAMS;
    if (!isPositiveSafeInteger(minOrderGrams) || !isPositiveSafeInteger(orderStepGrams)) {
      throw new LotError(
        "INVALID_GRAMS",
        `minOrderGrams and orderStepGrams must be positive safe integers, got ${String(minOrderGrams)} and ${String(orderStepGrams)}`,
      );
    }
    if (grams < minOrderGrams) {
      return "BELOW_MINIMUM";
    }
    if ((grams - minOrderGrams) % orderStepGrams !== 0) {
      return "OFF_STEP";
    }
  }
  return true;
}
