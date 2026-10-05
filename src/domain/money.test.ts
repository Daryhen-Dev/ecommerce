import { describe, it, expect } from "vitest";
import { cents, isCents, percentOf, formatUsd, type Cents } from "./money";

describe("cents guard", () => {
  it("accepts a non-negative safe integer", () => {
    expect(cents(0)).toBe(0);
    expect(cents(1250)).toBe(1250);
  });

  it("rejects non-integers", () => {
    expect(() => cents(12.5)).toThrow();
    expect(() => cents(Number.NaN)).toThrow();
    expect(() => cents(Number.POSITIVE_INFINITY)).toThrow();
  });

  it("rejects negatives", () => {
    expect(() => cents(-1)).toThrow();
  });

  it("rejects unsafe integers", () => {
    expect(() => cents(Number.MAX_SAFE_INTEGER + 1)).toThrow();
  });
});

describe("isCents", () => {
  it("checks the numeric invariant (branding is compile-time only)", () => {
    expect(isCents(cents(100))).toBe(true);
    expect(isCents(100)).toBe(true);
    expect(isCents(-1)).toBe(false);
    expect(isCents(1.5)).toBe(false);
    expect(isCents(Number.MAX_SAFE_INTEGER + 1)).toBe(false);
    expect(isCents("100")).toBe(false);
  });
});

describe("percentOf", () => {
  it("computes 15% of $30.00 as $4.50", () => {
    expect(percentOf(cents(3000), 1500)).toBe(450);
  });

  it("computes 5% (500 bps) of $20.00 as $1.00", () => {
    expect(percentOf(cents(2000), 500)).toBe(100);
  });

  it("rounds half up: 0.5 cent goes up", () => {
    // 1 cent * 5000 bps = 50% -> 0.5 cent -> rounds to 1
    expect(percentOf(cents(1), 5000)).toBe(1);
    // 3 cents * 5000 bps = 1.5 cents -> 2
    expect(percentOf(cents(3), 5000)).toBe(2);
  });

  it("rounds half up with exact integer arithmetic: 9263 * 1500 bps", () => {
    // 9263 * 0.15 = 1389.45 -> 1389 (round half up only applies at .5)
    expect(percentOf(cents(9263), 1500)).toBe(1389);
    // 9263 * 0.05 = 463.15 -> 463
    expect(percentOf(cents(9263), 500)).toBe(463);
    // exact half: 9262.5 would arise from 925 * 0.1% ... use 1 cent at 500 bps? no:
    // 15 cents * 1500 bps = 2.25 -> 2; but 5 cents * 1500 bps = 0.75 -> 1
    expect(percentOf(cents(5), 1500)).toBe(1);
    // exact .5: 1 cent at 2500 bps = 0.25 -> 0; 3 cents at 2500 bps = 0.75 -> 1;
    // 1 cent at 5000 bps = 0.5 -> 1 (half up)
    expect(percentOf(cents(1), 2500)).toBe(0);
  });

  it("returns 0 for 0 bps and full amount for 10000 bps", () => {
    expect(percentOf(cents(3450), 0)).toBe(0);
    expect(percentOf(cents(3450), 10000)).toBe(3450);
  });

  it("rejects non-integer or out-of-range bps", () => {
    expect(() => percentOf(cents(100), 12.5)).toThrow();
    expect(() => percentOf(cents(100), -1)).toThrow();
    expect(() => percentOf(cents(100), 10001)).toThrow();
  });
});

describe("formatUsd", () => {
  it("formats es-EC USD output as observed in this runtime", () => {
    // Observed with Node's full ICU: new Intl.NumberFormat("es-EC",
    // { style: "currency", currency: "USD" }).format(12.5) === "$12,50"
    expect(formatUsd(cents(1250))).toBe("$12,50");
    expect(formatUsd(cents(0))).toBe("$0,00");
    expect(formatUsd(cents(123450))).toBe("$1.234,50");
  });

  it("rejects values violating the cents invariant", () => {
    expect(() => formatUsd(-1 as unknown as Cents)).toThrow();
    expect(() => formatUsd(12.5 as unknown as Cents)).toThrow();
  });
});
