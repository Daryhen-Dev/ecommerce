// Lot reservation: kilograms available per landing lot, no overselling,
// minimum/step order validation. Pure domain: no framework, database, I/O
// or clock access; states are never mutated, every operation returns a new
// state. Numbers are integer grams mirroring the DB guarantees
// (`total_grams > 0`, `0 <= reserved_grams <= total_grams`,
// status OPEN/CLOSED).

import { describe, it, expect } from "vitest";
import {
  LotState,
  LotError,
  canReserve,
  reserve,
  release,
  closeLot,
  availableGrams,
  canFulfillOrder,
} from "./lot";

/** 10000 g lot with 7000 g already reserved (3000 g free). */
function openLot(overrides?: Partial<LotState>): LotState {
  return { totalGrams: 10000, reservedGrams: 7000, status: "OPEN", ...overrides };
}

function expectLotError(fn: () => unknown, code: string): void {
  try {
    fn();
    expect.fail(`expected LotError with code ${code}`);
  } catch (error) {
    expect(error).toBeInstanceOf(LotError);
    expect((error as LotError).code).toBe(code);
  }
}

describe("availableGrams", () => {
  it("returns total minus reserved", () => {
    expect(availableGrams(openLot())).toBe(3000);
  });

  it("returns 0 on a fully reserved lot, never negative", () => {
    expect(availableGrams(openLot({ reservedGrams: 10000 }))).toBe(0);
  });

  it("on a closed lot the remaining amount is still computable", () => {
    expect(availableGrams(openLot({ status: "CLOSED" }))).toBe(3000);
  });
});

describe("canReserve", () => {
  it("is true when the lot is open and the grams fit", () => {
    expect(canReserve(openLot(), 2500)).toBe(true);
  });

  it("is true at exactly full capacity (reserving the last 500)", () => {
    expect(canReserve(openLot({ reservedGrams: 9500 }), 500)).toBe(true);
  });

  it("is false when reserving one gram more than available", () => {
    expect(canReserve(openLot({ reservedGrams: 9500 }), 501)).toBe(false);
  });

  it("is false on a closed lot even with grams free", () => {
    expect(canReserve(openLot({ status: "CLOSED" }), 100)).toBe(false);
  });

  it("is false for zero, negative or non-integer grams without throwing", () => {
    const lot = openLot();
    expect(canReserve(lot, 0)).toBe(false);
    expect(canReserve(lot, -1)).toBe(false);
    expect(canReserve(lot, 2.5)).toBe(false);
    expect(canReserve(lot, "5" as unknown as number)).toBe(false);
  });
});

describe("reserve", () => {
  it("reserves 2500 g from a 10000 g lot with 7000 reserved and leaves the input untouched", () => {
    const lot = openLot();
    const next = reserve(lot, 2500);
    expect(next.reservedGrams).toBe(9500);
    expect(next.totalGrams).toBe(10000);
    expect(next.status).toBe("OPEN");
    expect(availableGrams(next)).toBe(500);
    expect(lot.reservedGrams).toBe(7000);
  });

  it("reserves the exact remaining grams (no overselling at the boundary)", () => {
    const next = reserve(openLot({ reservedGrams: 9500 }), 500);
    expect(next.reservedGrams).toBe(10000);
    expect(availableGrams(next)).toBe(0);
  });

  it("throws INSUFFICIENT_AVAILABLE when reserving 501 from 500 free", () => {
    expectLotError(() => reserve(openLot({ reservedGrams: 9500 }), 501), "INSUFFICIENT_AVAILABLE");
  });

  it("throws LOT_CLOSED on a closed lot", () => {
    expectLotError(() => reserve(openLot({ status: "CLOSED" }), 100), "LOT_CLOSED");
  });

  it("throws INVALID_GRAMS for 0, -1, 2.5, non-number and unsafe integers", () => {
    const lot = openLot();
    for (const bad of [0, -1, 2.5, "5" as unknown as number, 2 ** 53]) {
      expectLotError(() => reserve(lot, bad as number), "INVALID_GRAMS");
    }
    expect(lot.reservedGrams).toBe(7000);
  });

  it("throws LOT_STATE_INVALID for a corrupt input state instead of reserving", () => {
    expectLotError(
      () => reserve(openLot({ reservedGrams: 10001 }), 100),
      "LOT_STATE_INVALID",
    );
  });
});

describe("release", () => {
  it("decreases reservedGrams when an order is cancelled", () => {
    const lot = openLot();
    const next = release(lot, 2000);
    expect(next.reservedGrams).toBe(5000);
    expect(availableGrams(next)).toBe(5000);
    expect(lot.reservedGrams).toBe(7000);
  });

  it("throws INVALID_GRAMS for 0, -1, 2.5 and unsafe integers", () => {
    const lot = openLot();
    for (const bad of [0, -1, 2.5, 2 ** 53]) {
      expectLotError(() => release(lot, bad), "INVALID_GRAMS");
    }
  });

  it("throws RELEASE_EXCEEDS_RESERVED when releasing more than reserved", () => {
    expectLotError(() => release(openLot(), 7001), "RELEASE_EXCEEDS_RESERVED");
  });

  it("releases on a CLOSED lot: an order cancelled after the lot closed must get its grams back", () => {
    const lot = openLot({ status: "CLOSED" });
    const next = release(lot, 1000);
    expect(next.reservedGrams).toBe(6000);
    expect(next.status).toBe("CLOSED");
    expect(lot.reservedGrams).toBe(7000);
  });
});

describe("closeLot", () => {
  it("returns a closed copy and keeps reservedGrams unchanged", () => {
    const lot = openLot();
    const next = closeLot(lot);
    expect(next.status).toBe("CLOSED");
    expect(next.reservedGrams).toBe(7000);
    expect(next.totalGrams).toBe(10000);
    expect(lot.status).toBe("OPEN");
  });

  it("is idempotent: closing a closed lot is fine", () => {
    const closed = closeLot(openLot());
    const again = closeLot(closed);
    expect(again).toEqual(closed);
  });
});

describe("lot state guard", () => {
  it("throws LOT_STATE_INVALID when reservedGrams exceeds totalGrams", () => {
    expectLotError(() => availableGrams(openLot({ reservedGrams: 10001 })), "LOT_STATE_INVALID");
  });

  it("throws LOT_STATE_INVALID for a negative reservedGrams", () => {
    expectLotError(() => availableGrams(openLot({ reservedGrams: -1 })), "LOT_STATE_INVALID");
  });

  it("throws LOT_STATE_INVALID for a non-integer or unsafe totalGrams", () => {
    expectLotError(() => availableGrams(openLot({ totalGrams: 100.5 })), "LOT_STATE_INVALID");
    expectLotError(() => availableGrams(openLot({ totalGrams: 2 ** 53 })), "LOT_STATE_INVALID");
  });

  it("throws LOT_STATE_INVALID for a zero total and an unknown status", () => {
    expectLotError(() => availableGrams(openLot({ totalGrams: 0 })), "LOT_STATE_INVALID");
    expectLotError(
      () => availableGrams(openLot({ status: "PAUSED" as unknown as LotState["status"] })),
      "LOT_STATE_INVALID",
    );
  });
});

describe("canFulfillOrder", () => {
  it("accepts 1500 g against min 1000 g and step 500 g", () => {
    expect(canFulfillOrder(openLot(), 1500, {})).toBe(true);
  });

  it("rejects 800 g as BELOW_MINIMUM (min defaults to 1000 g when opts are given)", () => {
    expect(canFulfillOrder(openLot(), 800, {})).toBe("BELOW_MINIMUM");
  });

  it("rejects 1300 g as OFF_STEP (step defaults to 500 g when opts are given)", () => {
    expect(canFulfillOrder(openLot(), 1300, {})).toBe("OFF_STEP");
  });

  it("without opts, 1300 g is fine (no min/step check)", () => {
    expect(canFulfillOrder(openLot(), 1300)).toBe(true);
  });

  it("rejects a closed lot as CLOSED", () => {
    expect(canFulfillOrder(openLot({ status: "CLOSED" }), 1500, {})).toBe("CLOSED");
  });

  it("rejects more than available as INSUFFICIENT_AVAILABLE", () => {
    expect(canFulfillOrder(openLot(), 3500, {})).toBe("INSUFFICIENT_AVAILABLE");
  });

  it("rejects invalid grams as INVALID", () => {
    expect(canFulfillOrder(openLot(), 0, {})).toBe("INVALID");
    expect(canFulfillOrder(openLot(), -500, {})).toBe("INVALID");
    expect(canFulfillOrder(openLot(), 2.5, {})).toBe("INVALID");
    expect(canFulfillOrder(openLot(), 2 ** 53, {})).toBe("INVALID");
  });

  it("honors explicit min/step overrides", () => {
    expect(canFulfillOrder(openLot(), 800, { minOrderGrams: 500, orderStepGrams: 100 })).toBe(true);
    expect(canFulfillOrder(openLot(), 1300, { orderStepGrams: 100 })).toBe(true);
    expect(canFulfillOrder(openLot(), 1250, { orderStepGrams: 250 })).toBe(true);
    expect(canFulfillOrder(openLot(), 1300, { orderStepGrams: 250 })).toBe("OFF_STEP");
  });
});
