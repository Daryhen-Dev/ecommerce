// Pure shipment-window rules: ordering cutoff before departure and the
// lifecycle phase at a given instant. No clock access (the instant is a
// parameter); inputs are never mutated.

import { describe, it, expect } from "vitest";
import {
  canOrder,
  shipmentPhase,
  parseShipmentWindow,
  ShipmentError,
  type ShipmentWindow,
} from "./shipment";

// Quito flight: orders close 2025-08-10T23:59 (UTC-5), departs early on the
// 11th, arrives mid-morning, pickup during the day.
const UIO_FLIGHT: ShipmentWindow = {
  orderCutoffAt: new Date("2025-08-10T23:59:00-05:00"),
  departsAt: new Date("2025-08-11T06:00:00-05:00"),
  estimatedArrivalAt: new Date("2025-08-11T09:30:00-05:00"),
  pickupStartsAt: new Date("2025-08-11T10:00:00-05:00"),
  pickupEndsAt: new Date("2025-08-11T18:00:00-05:00"),
};

// Defensive-shape window: the cutoff equals the departure instant.
const CUTOFF_EQUALS_DEPARTURE: ShipmentWindow = {
  orderCutoffAt: new Date("2025-08-11T06:00:00-05:00"),
  departsAt: new Date("2025-08-11T06:00:00-05:00"),
  estimatedArrivalAt: new Date("2025-08-11T09:30:00-05:00"),
  pickupStartsAt: new Date("2025-08-11T10:00:00-05:00"),
  pickupEndsAt: new Date("2025-08-11T18:00:00-05:00"),
};

describe("canOrder", () => {
  it("is orderable before the cutoff", () => {
    expect(canOrder(UIO_FLIGHT, new Date("2025-08-09T12:00:00-05:00"))).toBe(true);
  });

  it("is orderable exactly at the cutoff (inclusive)", () => {
    expect(canOrder(UIO_FLIGHT, new Date("2025-08-10T23:59:00-05:00"))).toBe(true);
  });

  it("is not orderable 1 ms after the cutoff", () => {
    expect(canOrder(UIO_FLIGHT, new Date("2025-08-10T23:59:00.001-05:00"))).toBe(false);
  });

  it("is not orderable after departure even with a past cutoff", () => {
    expect(canOrder(UIO_FLIGHT, new Date("2025-08-11T12:00:00-05:00"))).toBe(false);
  });

  it("is not orderable far in the future", () => {
    expect(canOrder(UIO_FLIGHT, new Date("2026-01-01T00:00:00-05:00"))).toBe(false);
  });

  it("is not orderable in the gap after the cutoff but before departure", () => {
    expect(canOrder(UIO_FLIGHT, new Date("2025-08-11T03:00:00-05:00"))).toBe(false);
  });

  it("is not orderable at the departure instant when the cutoff equals it", () => {
    expect(canOrder(CUTOFF_EQUALS_DEPARTURE, new Date("2025-08-11T06:00:00-05:00"))).toBe(false);
  });

  it("is orderable 1 ms before a cutoff that equals the departure instant", () => {
    expect(canOrder(CUTOFF_EQUALS_DEPARTURE, new Date("2025-08-11T05:59:59.999-05:00"))).toBe(true);
  });
});

describe("shipmentPhase", () => {
  it("is ORDERING before the cutoff and exactly at it", () => {
    expect(shipmentPhase(UIO_FLIGHT, new Date("2025-08-01T12:00:00-05:00"))).toBe("ORDERING");
    expect(shipmentPhase(UIO_FLIGHT, new Date("2025-08-10T23:59:00-05:00"))).toBe("ORDERING");
  });

  it("is IN_FLIGHT in the gap after the cutoff but before departure (earliest next phase)", () => {
    expect(shipmentPhase(UIO_FLIGHT, new Date("2025-08-10T23:59:00.001-05:00"))).toBe("IN_FLIGHT");
    expect(shipmentPhase(UIO_FLIGHT, new Date("2025-08-11T03:00:00-05:00"))).toBe("IN_FLIGHT");
  });

  it("is IN_FLIGHT exactly at departure and while flying", () => {
    expect(shipmentPhase(UIO_FLIGHT, new Date("2025-08-11T06:00:00-05:00"))).toBe("IN_FLIGHT");
    expect(shipmentPhase(UIO_FLIGHT, new Date("2025-08-11T08:00:00-05:00"))).toBe("IN_FLIGHT");
  });

  it("is PICKUP exactly at the estimated arrival", () => {
    expect(shipmentPhase(UIO_FLIGHT, new Date("2025-08-11T09:30:00-05:00"))).toBe("PICKUP");
  });

  it("is PICKUP between arrival and pickupStartsAt (pickup window is the customer's responsibility)", () => {
    expect(shipmentPhase(UIO_FLIGHT, new Date("2025-08-11T09:45:00-05:00"))).toBe("PICKUP");
  });

  it("is PICKUP at pickupStartsAt and just before pickupEndsAt", () => {
    expect(shipmentPhase(UIO_FLIGHT, new Date("2025-08-11T10:00:00-05:00"))).toBe("PICKUP");
    expect(shipmentPhase(UIO_FLIGHT, new Date("2025-08-11T17:59:59.999-05:00"))).toBe("PICKUP");
  });

  it("is COMPLETED exactly at pickupEndsAt and afterwards", () => {
    expect(shipmentPhase(UIO_FLIGHT, new Date("2025-08-11T18:00:00-05:00"))).toBe("COMPLETED");
    expect(shipmentPhase(UIO_FLIGHT, new Date("2025-08-12T12:00:00-05:00"))).toBe("COMPLETED");
  });

  it("is COMPLETED from pickupEndsAt on even when pickup ends before the estimated arrival", () => {
    // Documented edge: the only hard invariant is pickupStartsAt < pickupEndsAt;
    // COMPLETED starts at pickupEndsAt regardless of the arrival estimate.
    const earlyEnd: ShipmentWindow = {
      orderCutoffAt: new Date("2025-08-10T23:59:00-05:00"),
      departsAt: new Date("2025-08-11T06:00:00-05:00"),
      estimatedArrivalAt: new Date("2025-08-11T09:30:00-05:00"),
      pickupStartsAt: new Date("2025-08-11T07:00:00-05:00"),
      pickupEndsAt: new Date("2025-08-11T08:00:00-05:00"),
    };
    expect(shipmentPhase(earlyEnd, new Date("2025-08-11T06:30:00-05:00"))).toBe("IN_FLIGHT");
    expect(shipmentPhase(earlyEnd, new Date("2025-08-11T08:00:00-05:00"))).toBe("COMPLETED");
    expect(shipmentPhase(earlyEnd, new Date("2025-08-11T09:45:00-05:00"))).toBe("COMPLETED");
  });
});

describe("parseShipmentWindow", () => {
  it("returns a valid window unchanged", () => {
    expect(parseShipmentWindow(UIO_FLIGHT)).toBe(UIO_FLIGHT);
  });

  it("rejects a cutoff after departure", () => {
    const invalid: ShipmentWindow = {
      ...UIO_FLIGHT,
      orderCutoffAt: new Date("2025-08-11T07:00:00-05:00"),
    };
    expect(() => parseShipmentWindow(invalid))
      .toThrow(expect.objectContaining({ name: "ShipmentError", code: "INVALID_SHIPMENT_WINDOW" }));
  });

  it("rejects a departure at or after the estimated arrival", () => {
    const arrivalEqualsDeparture: ShipmentWindow = {
      ...UIO_FLIGHT,
      estimatedArrivalAt: new Date("2025-08-11T06:00:00-05:00"),
    };
    expect(() => parseShipmentWindow(arrivalEqualsDeparture))
      .toThrow(expect.objectContaining({ code: "INVALID_SHIPMENT_WINDOW" }));
  });

  it("rejects pickupStartsAt equal to pickupEndsAt", () => {
    const invalid: ShipmentWindow = {
      ...UIO_FLIGHT,
      pickupStartsAt: new Date("2025-08-11T18:00:00-05:00"),
    };
    expect(() => parseShipmentWindow(invalid))
      .toThrow(expect.objectContaining({ code: "INVALID_SHIPMENT_WINDOW" }));
  });

  it("rejects a non-object input", () => {
    expect(() => parseShipmentWindow(null)).toThrow(expect.objectContaining({ code: "INVALID_SHIPMENT_WINDOW" }));
    expect(() => parseShipmentWindow("flight")).toThrow(expect.objectContaining({ code: "INVALID_SHIPMENT_WINDOW" }));
  });

  it("rejects a window with a non-Date field", () => {
    const invalid = { ...UIO_FLIGHT, departsAt: "2025-08-11" };
    expect(() => parseShipmentWindow(invalid)).toThrow(expect.objectContaining({ code: "INVALID_SHIPMENT_WINDOW" }));
  });

  it("rejects a window with an invalid Date field", () => {
    const invalid = { ...UIO_FLIGHT, pickupEndsAt: new Date("not-a-date") };
    expect(() => parseShipmentWindow(invalid)).toThrow(expect.objectContaining({ code: "INVALID_SHIPMENT_WINDOW" }));
  });
});

describe("validation on every call", () => {
  it("canOrder rejects a malformed window", () => {
    const invalid: ShipmentWindow = {
      ...UIO_FLIGHT,
      orderCutoffAt: new Date("2025-08-11T07:00:00-05:00"),
    };
    expect(() => canOrder(invalid, new Date("2025-08-09T12:00:00-05:00")))
      .toThrow(expect.objectContaining({ code: "INVALID_SHIPMENT_WINDOW" }));
  });

  it("shipmentPhase rejects a malformed window", () => {
    const invalid: ShipmentWindow = {
      ...UIO_FLIGHT,
      pickupStartsAt: new Date("2025-08-11T18:00:00-05:00"),
    };
    expect(() => shipmentPhase(invalid, new Date("2025-08-09T12:00:00-05:00")))
      .toThrow(expect.objectContaining({ code: "INVALID_SHIPMENT_WINDOW" }));
  });

  it("canOrder and shipmentPhase reject an invalid instant", () => {
    expect(() => canOrder(UIO_FLIGHT, new Date("not-a-date")))
      .toThrow(expect.objectContaining({ code: "INVALID_INSTANT" }));
    expect(() => shipmentPhase(UIO_FLIGHT, new Date("not-a-date")))
      .toThrow(expect.objectContaining({ code: "INVALID_INSTANT" }));
  });
});

describe("input immutability", () => {
  it("never mutates the shipment window", () => {
    const window: ShipmentWindow = {
      orderCutoffAt: new Date("2025-08-10T23:59:00-05:00"),
      departsAt: new Date("2025-08-11T06:00:00-05:00"),
      estimatedArrivalAt: new Date("2025-08-11T09:30:00-05:00"),
      pickupStartsAt: new Date("2025-08-11T10:00:00-05:00"),
      pickupEndsAt: new Date("2025-08-11T18:00:00-05:00"),
    };
    const before = Object.values(window).map((d) => d.getTime());
    canOrder(window, new Date("2025-08-09T12:00:00-05:00"));
    shipmentPhase(window, new Date("2025-08-11T12:00:00-05:00"));
    parseShipmentWindow(window);
    expect(Object.values(window).map((d) => d.getTime())).toEqual(before);
  });
});

describe("ShipmentError", () => {
  it("carries a stable machine-readable code", () => {
    const error = new ShipmentError("INVALID_SHIPMENT_WINDOW", "test message");
    expect(error).toBeInstanceOf(Error);
    expect(error.code).toBe("INVALID_SHIPMENT_WINDOW");
    expect(error.message).toBe("test message");
  });
});
