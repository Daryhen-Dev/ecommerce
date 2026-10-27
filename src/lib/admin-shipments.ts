// Pure admin logic for shipments (vuelos): the create-form parser, the
// domain window validation, the insert shape and the prefilled default
// window.
//
// No React, no `server-only`, no Prisma and no clock access: the request
// instant is a parameter, so the same rules run in the Server Action and in
// tests. The window invariants are NOT reimplemented here: they come from
// `@/domain/shipment`, the same module the storefront uses to decide whether
// a flight still accepts orders.

import {
  parseEcuadorDateTimeField,
  parseSelectField,
  parseTextField,
} from "@/lib/admin-fields";
import { toEcuadorDateTimeLocalValue } from "@/lib/admin-lots";
import { parseShipmentWindow, type ShipmentWindow } from "@/domain/shipment";

/** Per-field Spanish messages, keyed by input name. */
export type ShipmentFieldErrors = Record<string, string>;

/** The raw strings the create form submits (`""` when a field is absent). */
export type ShipmentRawFields = {
  airportCode: string;
  flightNumber: string;
  carrier: string;
  orderCutoffAt: string;
  departsAt: string;
  estimatedArrivalAt: string;
  pickupStartsAt: string;
  pickupEndsAt: string;
};

/** Parsed, validated values of a flight. */
export type ShipmentFormValues = {
  airportCode: string;
  /** Trimmed flight number, or null when the operator left it empty. */
  flightNumber: string | null;
  /** Trimmed carrier, or null when the operator left it empty. */
  carrier: string | null;
} & ShipmentWindow;

/** Shape handed to `db.shipment.create`. */
export type ShipmentInsert = {
  airportId: string;
  flightNumber: string | null;
  carrier: string | null;
  orderCutoffAt: Date;
  departsAt: Date;
  estimatedArrivalAt: Date;
  pickupStartsAt: Date;
  pickupEndsAt: Date;
  status: "SCHEDULED";
};

/** What the client form keeps between submissions. */
export type ShipmentFormState = {
  fieldErrors: ShipmentFieldErrors;
  formError?: string;
  raw: ShipmentRawFields;
};

/** Initial state of the create form, before the first submission. */
export const EMPTY_SHIPMENT_FORM_STATE: ShipmentFormState = {
  fieldErrors: {},
  raw: {
    airportCode: "",
    flightNumber: "",
    carrier: "",
    orderCutoffAt: "",
    departsAt: "",
    estimatedArrivalAt: "",
    pickupStartsAt: "",
    pickupEndsAt: "",
  },
};

/** Maximum length of the optional flight number. */
export const FLIGHT_NUMBER_MAX = 40;

/** Maximum length of the optional carrier name. */
export const CARRIER_MAX = 120;

/** Prefix of the window-invariant failure rendered at form level. */
export const SHIPMENT_DATES_MESSAGE = "Las fechas no son coherentes: ";

/**
 * A flight whose cutoff already passed cannot be created: the storefront
 * would never offer it and the operator would think the flight is live.
 */
export const PAST_CUTOFF_MESSAGE = "El cierre de pedidos debe ser futuro.";

// Default offsets of the create form (owner decision): cutoff two days ahead
// at 18:00 Ecuador, departure 14 h later, arrival 2 h after departure, and a
// three-hour pickup window opening at the arrival estimate.
const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

/**
 * Prefilled window for the create form, computed server-side so the browser
 * never has to guess the offsets (and so the first paint is deterministic).
 * Returns `datetime-local` values in Ecuador wall-clock time.
 */
export function buildDefaultShipmentWindow(now: Date): {
  orderCutoffAt: string;
  departsAt: string;
  estimatedArrivalAt: string;
  pickupStartsAt: string;
  pickupEndsAt: string;
} {
  // "Two days from now" is resolved on the Ecuador calendar, not on the
  // server's own time zone.
  const cutoffDay = toEcuadorDateTimeLocalValue(
    new Date(now.getTime() + 2 * DAY_MS),
  ).slice(0, 10);
  const cutoff = parseEcuadorDateTimeField(`${cutoffDay}T18:00`);
  const orderCutoffAt = cutoff.ok
    ? cutoff.value
    : new Date(now.getTime() + 2 * DAY_MS);
  const departsAt = new Date(orderCutoffAt.getTime() + 14 * HOUR_MS);
  const estimatedArrivalAt = new Date(departsAt.getTime() + 2 * HOUR_MS);
  const pickupStartsAt = estimatedArrivalAt;
  const pickupEndsAt = new Date(pickupStartsAt.getTime() + 3 * HOUR_MS);

  return {
    orderCutoffAt: toEcuadorDateTimeLocalValue(orderCutoffAt),
    departsAt: toEcuadorDateTimeLocalValue(departsAt),
    estimatedArrivalAt: toEcuadorDateTimeLocalValue(estimatedArrivalAt),
    pickupStartsAt: toEcuadorDateTimeLocalValue(pickupStartsAt),
    pickupEndsAt: toEcuadorDateTimeLocalValue(pickupEndsAt),
  };
}

/**
 * Parses the create-flight form: the airport select, two optional text fields
 * and the five datetimes. Field-level failures are collected together;
 * window invariants are NOT checked here (they need the full value set and
 * are reported at form level by `validateShipmentWindow`).
 */
export function parseShipmentForm(
  raw: ShipmentRawFields,
  options: { airportCodes: readonly string[] },
): { ok: true; values: ShipmentFormValues } | { ok: false; fieldErrors: ShipmentFieldErrors } {
  const fieldErrors: ShipmentFieldErrors = {};

  const airportCode = parseSelectField(raw.airportCode, options.airportCodes, {
    label: "aeropuerto",
  });
  if (!airportCode.ok) {
    fieldErrors.airportCode = airportCode.error;
  }

  const flightNumber = parseTextField(raw.flightNumber, {
    required: false,
    max: FLIGHT_NUMBER_MAX,
    label: "número de vuelo",
  });
  if (!flightNumber.ok) {
    fieldErrors.flightNumber = flightNumber.error;
  }

  const carrier = parseTextField(raw.carrier, {
    required: false,
    max: CARRIER_MAX,
    label: "transportista",
  });
  if (!carrier.ok) {
    fieldErrors.carrier = carrier.error;
  }

  const dates = {
    orderCutoffAt: parseEcuadorDateTimeField(raw.orderCutoffAt),
    departsAt: parseEcuadorDateTimeField(raw.departsAt),
    estimatedArrivalAt: parseEcuadorDateTimeField(raw.estimatedArrivalAt),
    pickupStartsAt: parseEcuadorDateTimeField(raw.pickupStartsAt),
    pickupEndsAt: parseEcuadorDateTimeField(raw.pickupEndsAt),
  };
  for (const [field, parsed] of Object.entries(dates)) {
    if (!parsed.ok) {
      fieldErrors[field] = parsed.error;
    }
  }

  const failed = Object.keys(fieldErrors).length > 0;
  // Narrow every parse explicitly: TypeScript does not narrow through
  // `Object.values`, and each value is needed below.
  if (
    failed ||
    !airportCode.ok ||
    !flightNumber.ok ||
    !carrier.ok ||
    !dates.orderCutoffAt.ok ||
    !dates.departsAt.ok ||
    !dates.estimatedArrivalAt.ok ||
    !dates.pickupStartsAt.ok ||
    !dates.pickupEndsAt.ok
  ) {
    return { ok: false, fieldErrors };
  }

  return {
    ok: true,
    values: {
      airportCode: airportCode.value,
      flightNumber: flightNumber.value === "" ? null : flightNumber.value,
      carrier: carrier.value === "" ? null : carrier.value,
      orderCutoffAt: dates.orderCutoffAt.value,
      departsAt: dates.departsAt.value,
      estimatedArrivalAt: dates.estimatedArrivalAt.value,
      pickupStartsAt: dates.pickupStartsAt.value,
      pickupEndsAt: dates.pickupEndsAt.value,
    },
  };
}

/** Wraps a domain failure in the Spanish sentence the form shows. */
export function shipmentFormErrorFromDomain(error: unknown): string {
  const detail = error instanceof Error ? error.message : String(error);
  return `${SHIPMENT_DATES_MESSAGE}${detail}`;
}

/**
 * Form-level validation of a parsed window: the domain invariants
 * (`orderCutoffAt <= departsAt < estimatedArrivalAt`, `pickupStartsAt <
 * pickupEndsAt`) plus the admin-only rule that the cutoff must be in the
 * future. Returns null when the flight may be created.
 *
 * The invariants run first: a window that is both incoherent and past would
 * otherwise hide the real mistake behind the past-cutoff message.
 */
export function validateShipmentWindow(
  values: ShipmentFormValues,
  at: Date,
): string | null {
  try {
    parseShipmentWindow(values);
  } catch (error) {
    return shipmentFormErrorFromDomain(error);
  }
  if (values.orderCutoffAt.getTime() <= at.getTime()) {
    return PAST_CUTOFF_MESSAGE;
  }
  return null;
}

/** Builds the row to insert: a new flight is always SCHEDULED and open. */
export function toShipmentInsert(values: ShipmentFormValues, airportId: string): ShipmentInsert {
  return {
    airportId,
    flightNumber: values.flightNumber,
    carrier: values.carrier,
    orderCutoffAt: values.orderCutoffAt,
    departsAt: values.departsAt,
    estimatedArrivalAt: values.estimatedArrivalAt,
    pickupStartsAt: values.pickupStartsAt,
    pickupEndsAt: values.pickupEndsAt,
    status: "SCHEDULED",
  };
}
