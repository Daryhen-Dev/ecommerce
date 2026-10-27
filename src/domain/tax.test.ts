// Pure VAT-rate resolution: effective-dated rates per category. No clock
// access (the instant is a parameter); inputs are never mutated.

import { describe, it, expect } from "vitest";
import { resolveVatRates, TaxError, type DatedVatRate } from "./tax";
import type { VatCategory } from "./pricing";

// Historical rate change: 12% until 2024-05-01, 15% from that date
// (instants expressed with the Ecuador offset).
const RATE_12: DatedVatRate = {
  category: "STANDARD",
  rateBps: 1200,
  effectiveFrom: new Date("2020-01-01T00:00:00-05:00"),
};
const RATE_15: DatedVatRate = {
  category: "STANDARD",
  rateBps: 1500,
  effectiveFrom: new Date("2024-05-01T00:00:00-05:00"),
};
const RATE_0: DatedVatRate = {
  category: "ZERO_RATED",
  rateBps: 0,
  effectiveFrom: new Date("2000-01-01T00:00:00-05:00"),
};

describe("resolveVatRates", () => {
  it("resolves the rate in effect before a rate change", () => {
    const rates = resolveVatRates([RATE_12, RATE_15, RATE_0], new Date("2023-06-15T12:00:00-05:00"));
    expect(rates).toEqual({ STANDARD: 1200, ZERO_RATED: 0 });
  });

  it("uses the new rate exactly at the boundary instant", () => {
    const boundary = new Date("2024-05-01T00:00:00-05:00");
    const rates = resolveVatRates([RATE_12, RATE_15, RATE_0], boundary);
    expect(rates.STANDARD).toBe(1500);
  });

  it("resolves the rate in effect after the rate change", () => {
    const rates = resolveVatRates([RATE_12, RATE_15, RATE_0], new Date("2025-10-05T12:00:00-05:00"));
    expect(rates).toEqual({ STANDARD: 1500, ZERO_RATED: 0 });
  });

  it("accepts an unsorted input array", () => {
    const rates = resolveVatRates([RATE_15, RATE_0, RATE_12], new Date("2023-06-15T12:00:00-05:00"));
    expect(rates.STANDARD).toBe(1200);
  });

  it("returns a fresh object each call (not a shared reference)", () => {
    const first = resolveVatRates([RATE_12, RATE_0], new Date("2023-01-01T00:00:00-05:00"));
    const second = resolveVatRates([RATE_12, RATE_0], new Date("2023-01-01T00:00:00-05:00"));
    expect(first).not.toBe(second);
    expect(first).toEqual(second);
  });

  it("does not mutate the input array", () => {
    const input: DatedVatRate[] = [RATE_15, RATE_0, RATE_12];
    const snapshot = input.map((r) => ({ ...r, effectiveFrom: new Date(r.effectiveFrom.getTime()) }));
    resolveVatRates(input, new Date("2023-06-15T12:00:00-05:00"));
    expect(input).toEqual(snapshot);
    expect(input.map((r) => r.effectiveFrom.getTime())).toEqual(
      snapshot.map((r) => r.effectiveFrom.getTime()),
    );
  });

  it("throws NO_RATE_IN_EFFECT when a category has no rate at the instant", () => {
    // RATE_15 only becomes effective later; at 2019 the 12% row does not exist yet.
    expect(() => resolveVatRates([RATE_15, RATE_0], new Date("2019-01-01T00:00:00-05:00")))
      .toThrow(expect.objectContaining({ name: "TaxError", code: "NO_RATE_IN_EFFECT" }));
    expect(() => resolveVatRates([RATE_15, RATE_0], new Date("2019-01-01T00:00:00-05:00")))
      .toThrow(/STANDARD/);
  });

  it("throws NO_RATE_IN_EFFECT for an empty rate list", () => {
    expect(() => resolveVatRates([], new Date("2025-01-01T00:00:00-05:00")))
      .toThrow(expect.objectContaining({ code: "NO_RATE_IN_EFFECT" }));
  });

  it("rejects a non-integer rate", () => {
    expect(() => resolveVatRates([{ ...RATE_12, rateBps: 12.5 }], new Date("2023-01-01T00:00:00-05:00")))
      .toThrow(expect.objectContaining({ code: "INVALID_RATE" }));
  });

  it("rejects a rate above 10000 bps", () => {
    expect(() => resolveVatRates([{ ...RATE_12, rateBps: 15000 }], new Date("2023-01-01T00:00:00-05:00")))
      .toThrow(expect.objectContaining({ code: "INVALID_RATE" }));
  });

  it("rejects a negative rate", () => {
    expect(() => resolveVatRates([{ ...RATE_12, rateBps: -1 }], new Date("2023-01-01T00:00:00-05:00")))
      .toThrow(expect.objectContaining({ code: "INVALID_RATE" }));
  });

  it("rejects an unknown category", () => {
    expect(() =>
      resolveVatRates(
        [{ ...RATE_12, category: "REDUCED" as VatCategory }],
        new Date("2023-01-01T00:00:00-05:00"),
      ),
    ).toThrow(expect.objectContaining({ code: "INVALID_RATE" }));
  });

  it("rejects duplicate (category, effectiveFrom) pairs", () => {
    expect(() => resolveVatRates([RATE_12, { ...RATE_12 }, RATE_0], new Date("2023-01-01T00:00:00-05:00")))
      .toThrow(expect.objectContaining({ code: "DUPLICATE_RATE" }));
  });

  it("rejects an invalid instant", () => {
    expect(() => resolveVatRates([RATE_12, RATE_0], new Date("not-a-date")))
      .toThrow(expect.objectContaining({ code: "INVALID_INSTANT" }));
  });
});

describe("TaxError", () => {
  it("carries a stable machine-readable code", () => {
    const error = new TaxError("NO_RATE_IN_EFFECT", "test message");
    expect(error).toBeInstanceOf(Error);
    expect(error.code).toBe("NO_RATE_IN_EFFECT");
    expect(error.message).toBe("test message");
  });
});
