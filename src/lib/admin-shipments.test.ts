// Unit tests for the pure shipment (vuelo) admin logic: parsing the five
// datetime-local fields plus the airport select and the optional text fields,
// the domain window invariants, the future-cutoff rule, the insert shape and
// the prefilled defaults the form renders.
//
// The module is pure (no React, no `server-only`, no Prisma): the request
// instant is always a parameter, so every expectation below is deterministic.

import { describe, expect, it } from "vitest";

import {
  buildDefaultShipmentWindow,
  parseShipmentForm,
  PAST_CUTOFF_MESSAGE,
  SHIPMENT_DATES_MESSAGE,
  shipmentFormErrorFromDomain,
  toShipmentInsert,
  validateShipmentWindow,
  type ShipmentFormValues,
  type ShipmentRawFields,
} from "./admin-shipments";

const AIRPORT_CODES = ["UIO", "GYE", "CUE"] as const;

/** Raw form values for a coherent UIO window; spread and override per test. */
function rawFields(overrides: Partial<ShipmentRawFields> = {}): ShipmentRawFields {
  return {
    airportCode: "UIO",
    flightNumber: "E2E-TEST-1",
    carrier: "Carga aérea",
    orderCutoffAt: "2026-10-08T18:00",
    departsAt: "2026-10-09T08:00",
    estimatedArrivalAt: "2026-10-09T10:00",
    pickupStartsAt: "2026-10-09T10:00",
    pickupEndsAt: "2026-10-09T13:00",
    ...overrides,
  };
}

/** Instant of `at` used by every validation test below. */
const NOW = new Date("2026-10-06T12:00:00.000Z");

function valuesOf(result: ReturnType<typeof parseShipmentForm>): ShipmentFormValues {
  if (!result.ok) {
    throw new Error(`expected a successful parse, got ${JSON.stringify(result.fieldErrors)}`);
  }
  return result.values;
}

function fieldErrorOf(
  result: ReturnType<typeof parseShipmentForm>,
  field: string,
  expected: string,
): void {
  if (result.ok) {
    throw new Error(`expected a failure, got ${JSON.stringify(result.values)}`);
  }
  expect(result.fieldErrors[field]).toBe(expected);
}

describe("parseShipmentForm", () => {
  it("parses the five windows as Ecuador instants and keeps the text fields", () => {
    const values = valuesOf(parseShipmentForm(rawFields(), { airportCodes: AIRPORT_CODES }));

    expect(values.airportCode).toBe("UIO");
    expect(values.flightNumber).toBe("E2E-TEST-1");
    expect(values.carrier).toBe("Carga aérea");
    // Ecuador is UTC-5 with no DST: 18:00 local is 23:00Z the same day.
    expect(values.orderCutoffAt.toISOString()).toBe("2026-10-08T23:00:00.000Z");
    expect(values.departsAt.toISOString()).toBe("2026-10-09T13:00:00.000Z");
    expect(values.estimatedArrivalAt.toISOString()).toBe("2026-10-09T15:00:00.000Z");
    expect(values.pickupStartsAt.toISOString()).toBe("2026-10-09T15:00:00.000Z");
    expect(values.pickupEndsAt.toISOString()).toBe("2026-10-09T18:00:00.000Z");
  });

  it("stores empty optional fields as null", () => {
    const values = valuesOf(
      parseShipmentForm(rawFields({ flightNumber: "  ", carrier: "" }), {
        airportCodes: AIRPORT_CODES,
      }),
    );

    expect(values.flightNumber).toBeNull();
    expect(values.carrier).toBeNull();
  });

  it("rejects an airport that is not offered", () => {
    fieldErrorOf(
      parseShipmentForm(rawFields({ airportCode: "LIM" }), { airportCodes: AIRPORT_CODES }),
      "airportCode",
      "Elige una opción válida para el aeropuerto.",
    );
  });

  it("rejects unreadable datetimes field by field", () => {
    const result = parseShipmentForm(rawFields({ departsAt: "", pickupEndsAt: "mañana" }), {
      airportCodes: AIRPORT_CODES,
    });

    fieldErrorOf(result, "departsAt", "Fecha y hora inválidas.");
    fieldErrorOf(result, "pickupEndsAt", "Fecha y hora inválidas.");
    // The valid datetimes of the same form are not reported.
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.fieldErrors.orderCutoffAt).toBeUndefined();
    expect(result.fieldErrors.pickupStartsAt).toBeUndefined();
  });

  it("rejects a flight number that is too long", () => {
    fieldErrorOf(
      parseShipmentForm(rawFields({ flightNumber: "A".repeat(41) }), {
        airportCodes: AIRPORT_CODES,
      }),
      "flightNumber",
      "El número de vuelo no puede tener más de 40 caracteres.",
    );
  });

  it("rejects a carrier that is too long", () => {
    fieldErrorOf(
      parseShipmentForm(rawFields({ carrier: "C".repeat(121) }), {
        airportCodes: AIRPORT_CODES,
      }),
      "carrier",
      "El transportista no puede tener más de 120 caracteres.",
    );
  });
});

describe("validateShipmentWindow", () => {
  it("accepts a coherent, future window", () => {
    const values = valuesOf(parseShipmentForm(rawFields(), { airportCodes: AIRPORT_CODES }));

    expect(validateShipmentWindow(values, NOW)).toBeNull();
  });

  it("rejects a cutoff later than the departure", () => {
    const values = valuesOf(
      parseShipmentForm(rawFields({ departsAt: "2026-10-08T17:00" }), {
        airportCodes: AIRPORT_CODES,
      }),
    );

    const message = validateShipmentWindow(values, NOW);
    expect(message).toContain(SHIPMENT_DATES_MESSAGE);
  });

  it("rejects an arrival that is not after the departure", () => {
    const values = valuesOf(
      parseShipmentForm(rawFields({ estimatedArrivalAt: "2026-10-09T08:00" }), {
        airportCodes: AIRPORT_CODES,
      }),
    );

    const message = validateShipmentWindow(values, NOW);
    expect(message).toContain(SHIPMENT_DATES_MESSAGE);
    expect(message).toContain("estimatedArrivalAt");
  });

  it("rejects a pickup window that ends before it starts", () => {
    const values = valuesOf(
      parseShipmentForm(rawFields({ pickupEndsAt: "2026-10-09T09:00" }), {
        airportCodes: AIRPORT_CODES,
      }),
    );

    const message = validateShipmentWindow(values, NOW);
    expect(message).toContain(SHIPMENT_DATES_MESSAGE);
    expect(message).toContain("pickupStartsAt");
  });

  it("rejects a cutoff in the past", () => {
    const values = valuesOf(
      parseShipmentForm(rawFields({ orderCutoffAt: "2026-10-05T18:00" }), {
        airportCodes: AIRPORT_CODES,
      }),
    );

    expect(validateShipmentWindow(values, NOW)).toBe(PAST_CUTOFF_MESSAGE);
  });

  it("rejects a cutoff that is exactly now (the cutoff must be future)", () => {
    const values = valuesOf(
      parseShipmentForm(rawFields({ orderCutoffAt: "2026-10-06T07:00" }), {
        airportCodes: AIRPORT_CODES,
      }),
    );

    expect(validateShipmentWindow(values, new Date("2026-10-06T12:00:00.000Z"))).toBe(
      PAST_CUTOFF_MESSAGE,
    );
  });

  it("accepts a cutoff one minute in the future", () => {
    const values = valuesOf(
      parseShipmentForm(rawFields({ orderCutoffAt: "2026-10-06T07:01" }), {
        airportCodes: AIRPORT_CODES,
      }),
    );

    expect(validateShipmentWindow(values, new Date("2026-10-06T12:00:00.000Z"))).toBeNull();
  });
});

describe("shipmentFormErrorFromDomain", () => {
  it("wraps the domain message behind the Spanish invariant sentence", () => {
    const message = shipmentFormErrorFromDomain(
      new Error("departsAt (a) must be earlier than estimatedArrivalAt (b)"),
    );

    expect(message).toBe(
      "Las fechas no son coherentes: departsAt (a) must be earlier than estimatedArrivalAt (b)",
    );
  });

  it("still produces a usable message for a non-Error value", () => {
    expect(shipmentFormErrorFromDomain("boom")).toBe("Las fechas no son coherentes: boom");
  });
});

describe("toShipmentInsert", () => {
  it("inserts a SCHEDULED shipment for the resolved airport", () => {
    const values = valuesOf(parseShipmentForm(rawFields(), { airportCodes: AIRPORT_CODES }));

    expect(toShipmentInsert(values, "airport-id-1")).toEqual({
      airportId: "airport-id-1",
      flightNumber: "E2E-TEST-1",
      carrier: "Carga aérea",
      orderCutoffAt: new Date("2026-10-08T23:00:00.000Z"),
      departsAt: new Date("2026-10-09T13:00:00.000Z"),
      estimatedArrivalAt: new Date("2026-10-09T15:00:00.000Z"),
      pickupStartsAt: new Date("2026-10-09T15:00:00.000Z"),
      pickupEndsAt: new Date("2026-10-09T18:00:00.000Z"),
      status: "SCHEDULED",
    });
  });
});

describe("buildDefaultShipmentWindow", () => {
  it("prefills cutoff at 18:00 two days ahead, then the derived offsets", () => {
    // 2026-10-06T12:00Z is 07:00 on Oct 6 in Ecuador.
    const fields = buildDefaultShipmentWindow(new Date("2026-10-06T12:00:00.000Z"));

    expect(fields).toEqual({
      orderCutoffAt: "2026-10-08T18:00",
      departsAt: "2026-10-09T08:00",
      estimatedArrivalAt: "2026-10-09T10:00",
      pickupStartsAt: "2026-10-09T10:00",
      pickupEndsAt: "2026-10-09T13:00",
    });
  });

  it("produces a window that its own parser accepts and validation passes", () => {
    const fields = buildDefaultShipmentWindow(new Date("2026-10-06T12:00:00.000Z"));
    const values = valuesOf(
      parseShipmentForm({ ...rawFields(fields), airportCode: "GYE", flightNumber: "", carrier: "" }, {
        airportCodes: AIRPORT_CODES,
      }),
    );

    expect(validateShipmentWindow(values, new Date("2026-10-06T12:00:00.000Z"))).toBeNull();
  });

  it("does not shift the day when now is late at night in Ecuador", () => {
    // 2026-10-07T03:00Z is 22:00 on Oct 6 in Ecuador, so day +2 is Oct 8.
    const fields = buildDefaultShipmentWindow(new Date("2026-10-07T03:00:00.000Z"));

    expect(fields.orderCutoffAt).toBe("2026-10-08T18:00");
  });
});
