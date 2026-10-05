import { describe, it, expect } from "vitest";
import { grams as gramsOf, isGrams, parseKilograms, formatKilograms, type Grams } from "./weight";

describe("grams guard", () => {
  it("accepts a positive safe integer", () => {
    expect(gramsOf(7500)).toBe(7500);
    expect(gramsOf(1)).toBe(1);
  });

  it("rejects zero, negatives, non-integers and unsafe integers", () => {
    expect(() => gramsOf(0)).toThrow();
    expect(() => gramsOf(-100)).toThrow();
    expect(() => gramsOf(7.5)).toThrow();
    expect(() => gramsOf(Number.MAX_SAFE_INTEGER + 1)).toThrow();
    expect(() => gramsOf(Number.NaN)).toThrow();
  });
});

describe("isGrams", () => {
  it("checks the numeric invariant (branding is compile-time only)", () => {
    expect(isGrams(gramsOf(7500))).toBe(true);
    expect(isGrams(7500)).toBe(true);
    expect(isGrams(0)).toBe(false);
    expect(isGrams(-1)).toBe(false);
    expect(isGrams(0.5)).toBe(false);
    expect(isGrams("7500")).toBe(false);
  });
});

describe("parseKilograms", () => {
  it("parses dot decimals: 7.5 kg -> 7500 g", () => {
    expect(parseKilograms("7.5")).toBe(gramsOf(7500));
  });

  it("parses whole kilograms: 8 -> 8000 g", () => {
    expect(parseKilograms("8")).toBe(gramsOf(8000));
  });

  it("parses three decimals: 0.125 -> 125 g", () => {
    expect(parseKilograms("0.125")).toBe(gramsOf(125));
  });

  it("trims surrounding whitespace: ' 7.5 ' -> 7500 g", () => {
    expect(parseKilograms(" 7.5 ")).toBe(gramsOf(7500));
  });

  it("parses without float math: 0.1 + style inputs land on exact grams", () => {
    expect(parseKilograms("0.3")).toBe(gramsOf(300));
    expect(parseKilograms("12.345")).toBe(gramsOf(12345));
  });

  it("rejects empty and whitespace-only input", () => {
    expect(() => parseKilograms("")).toThrow();
    expect(() => parseKilograms("   ")).toThrow();
  });

  it("rejects comma as decimal separator: ',' is never a separator", () => {
    expect(() => parseKilograms("7,5")).toThrow();
    expect(() => parseKilograms("0,125")).toThrow();
    expect(() => parseKilograms("7,")).toThrow();
  });

  it("rejects comma as thousands grouping: grouping is not input syntax", () => {
    expect(() => parseKilograms("1,000")).toThrow();
    expect(() => parseKilograms("1,000.5")).toThrow();
  });

  it("rejects zero and negative values", () => {
    expect(() => parseKilograms("0")).toThrow();
    expect(() => parseKilograms("0.000")).toThrow();
    expect(() => parseKilograms("-7.5")).toThrow();
  });

  it("rejects non-numeric input", () => {
    expect(() => parseKilograms("abc")).toThrow();
    expect(() => parseKilograms("7 kg")).toThrow();
    expect(() => parseKilograms("7.5.1")).toThrow();
  });

  it("rejects more than three decimals", () => {
    expect(() => parseKilograms("7.5001")).toThrow();
    expect(() => parseKilograms("7.1234")).toThrow();
  });

  it("rejects exponent notation", () => {
    expect(() => parseKilograms("7.5e2")).toThrow();
    expect(() => parseKilograms("1e3")).toThrow();
  });

  it("rejects a trailing separator with no decimals", () => {
    expect(() => parseKilograms("7.")).toThrow();
  });

  it("rejects values that overflow safe grams", () => {
    expect(() => parseKilograms("99999999999999999999")).toThrow();
  });
});

describe("formatKilograms", () => {
  it("formats 7500 g as '7.5 kg' (dot decimal, no trailing zeros)", () => {
    expect(formatKilograms(gramsOf(7500))).toBe("7.5 kg");
  });

  it("formats 1250 g as '1.25 kg'", () => {
    expect(formatKilograms(gramsOf(1250))).toBe("1.25 kg");
  });

  it("formats sub-kilogram weights: 125 g as '0.125 kg'", () => {
    expect(formatKilograms(gramsOf(125))).toBe("0.125 kg");
  });

  it("formats 50 g as '0.05 kg' keeping significant decimal places only", () => {
    expect(formatKilograms(gramsOf(50))).toBe("0.05 kg");
  });

  it("formats whole kilograms without decimals: 8000 g as '8 kg'", () => {
    expect(formatKilograms(gramsOf(8000))).toBe("8 kg");
  });

  it("rejects values violating the grams invariant", () => {
    expect(() => formatKilograms(0 as unknown as Grams)).toThrow();
    expect(() => formatKilograms(-1 as unknown as Grams)).toThrow();
    expect(() => formatKilograms(7.5 as unknown as Grams)).toThrow();
  });
});
