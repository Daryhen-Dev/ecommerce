// Unit tests for the pure order-admin logic: the manual status transitions the
// panel offers, the Spanish labels and the timestamps a transition writes.
//
// The panel is read-only except for these transitions, so this module is the
// whole rule set: a transition it refuses must never reach the database.

import { describe, expect, it } from "vitest";

import {
  ORDER_TRANSITION_MESSAGE,
  canTransition,
  isTransitionTarget,
  orderStatusLabel,
  orderTransitionLabel,
  paidAtForTransition,
  parseOrderStatusField,
  pickDefaultShipmentId,
  transitionFormError,
} from "./admin-orders";

describe("canTransition", () => {
  it("lets an unpaid order be marked paid or cancelled", () => {
    expect(canTransition("PENDING_PAYMENT", "PAID")).toBe(true);
    expect(canTransition("PENDING_PAYMENT", "CANCELLED")).toBe(true);
  });

  it("treats repeating the current status as a no-op, not a change", () => {
    expect(canTransition("PAID", "PAID")).toBe(true);
    expect(canTransition("CANCELLED", "CANCELLED")).toBe(true);
  });

  it("refuses every other transition", () => {
    // A paid order is not silently cancellable from the panel: refunding is a
    // business decision with money behind it, not a status click.
    expect(canTransition("PAID", "CANCELLED")).toBe(false);
    expect(canTransition("PAID", "PENDING_PAYMENT")).toBe(false);
    expect(canTransition("CANCELLED", "PAID")).toBe(false);
    expect(canTransition("CANCELLED", "PICKED_UP")).toBe(false);
    expect(canTransition("PICKED_UP", "PAID")).toBe(false);
    expect(canTransition("PENDING_PAYMENT", "PICKED_UP")).toBe(false);
  });
});

describe("transitionFormError", () => {
  it("returns the Spanish refusal for an illegal transition", () => {
    expect(transitionFormError("PAID", "CANCELLED")).toBe(ORDER_TRANSITION_MESSAGE);
    expect(ORDER_TRANSITION_MESSAGE).toBe(
      "Ese pedido ya no admite ese cambio de estado.",
    );
  });

  it("returns null for an allowed transition or a repeated status", () => {
    expect(transitionFormError("PENDING_PAYMENT", "PAID")).toBeNull();
    expect(transitionFormError("PAID", "PAID")).toBeNull();
  });
});

describe("paidAtForTransition", () => {
  const now = new Date("2026-02-01T12:00:00.000Z");

  it("stamps the payment instant when the order becomes paid", () => {
    expect(paidAtForTransition({ next: "PAID", now })).toEqual(now);
  });

  it("writes no payment instant for any other status", () => {
    expect(paidAtForTransition({ next: "CANCELLED", now })).toBeNull();
    expect(paidAtForTransition({ next: "PENDING_PAYMENT", now })).toBeNull();
  });
});

describe("orderStatusLabel", () => {
  it("labels every status in Spanish, never with the raw database value", () => {
    expect(orderStatusLabel("PENDING_PAYMENT")).toBe("Pendiente de pago");
    expect(orderStatusLabel("PAID")).toBe("Pagado");
    expect(orderStatusLabel("CANCELLED")).toBe("Cancelado");
    expect(orderStatusLabel("PICKED_UP")).toBe("Retirado");
  });
});

// --- additions for the section page -----------------------------------------

describe("pickDefaultShipmentId", () => {
  const shipments = [
    { id: "newest-without-orders", orderCount: 0 },
    { id: "with-orders", orderCount: 3 },
    { id: "older-with-orders", orderCount: 1 },
  ];

  it("defaults to the newest shipment that already has orders", () => {
    expect(pickDefaultShipmentId(shipments)).toBe("with-orders");
  });

  it("falls back to the newest shipment when nobody has ordered yet", () => {
    expect(
      pickDefaultShipmentId([
        { id: "newest", orderCount: 0 },
        { id: "older", orderCount: 0 },
      ]),
    ).toBe("newest");
  });

  it("returns null only when there is no shipment at all", () => {
    expect(pickDefaultShipmentId([])).toBeNull();
  });
});

describe("parseOrderStatusField", () => {
  it("accepts every stored status", () => {
    expect(parseOrderStatusField("PENDING_PAYMENT")).toBe("PENDING_PAYMENT");
    expect(parseOrderStatusField("PAID")).toBe("PAID");
    expect(parseOrderStatusField("CANCELLED")).toBe("CANCELLED");
    expect(parseOrderStatusField("PICKED_UP")).toBe("PICKED_UP");
  });

  it("rejects anything the database could not hold", () => {
    expect(parseOrderStatusField("")).toBeNull();
    expect(parseOrderStatusField("paid")).toBeNull();
    expect(parseOrderStatusField("REFUNDED")).toBeNull();
  });
});

describe("isTransitionTarget", () => {
  it("accepts only the two targets the panel offers buttons for", () => {
    expect(isTransitionTarget("PAID")).toBe(true);
    expect(isTransitionTarget("CANCELLED")).toBe(true);
    expect(isTransitionTarget("PENDING_PAYMENT")).toBe(false);
    expect(isTransitionTarget("PICKED_UP")).toBe(false);
  });
});

describe("orderTransitionLabel", () => {
  it("labels both buttons in Spanish", () => {
    expect(orderTransitionLabel("PAID")).toBe("Marcar pagado");
    expect(orderTransitionLabel("CANCELLED")).toBe("Cancelar");
  });
});
