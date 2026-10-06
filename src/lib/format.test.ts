import { describe, expect, it } from "vitest";

import {
  formatEcuadorDate,
  formatEcuadorDateTime,
  formatPercentFromBps,
} from "./format";

describe("formatEcuadorDateTime", () => {
  it("formats a UTC instant as an Ecuador local date and 24h time", () => {
    // 2025-10-08T23:00Z == 18:00 in America/Guayaquil (UTC-5, no DST).
    expect(formatEcuadorDateTime(new Date("2025-10-08T23:00:00Z"))).toBe(
      "miércoles 8 de octubre, 18:00",
    );
  });

  it("maps a UTC instant to the previous calendar day in Ecuador", () => {
    // 2025-10-09T03:00Z is still October 8 in Ecuador.
    expect(formatEcuadorDateTime(new Date("2025-10-09T03:00:00Z"))).toBe(
      "miércoles 8 de octubre, 22:00",
    );
  });

  it("uses a zero-padded 24h clock at midnight (never 24:xx)", () => {
    expect(formatEcuadorDateTime(new Date("2025-10-09T05:00:00Z"))).toBe(
      "jueves 9 de octubre, 00:00",
    );
  });

  it("never emits narrow no-break spaces or non-breaking spaces", () => {
    const text = formatEcuadorDateTime(new Date("2025-10-08T23:00:00Z"));
    expect(text).not.toMatch(/[\u00a0\u202f]/);
  });
});

describe("formatEcuadorDate", () => {
  it("formats day and month without year", () => {
    expect(formatEcuadorDate(new Date("2025-11-15T15:00:00Z"))).toBe(
      "15 de noviembre",
    );
  });

  it("maps a UTC instant to the previous calendar day in Ecuador", () => {
    expect(formatEcuadorDate(new Date("2025-11-16T02:00:00Z"))).toBe(
      "15 de noviembre",
    );
  });
});

describe("formatPercentFromBps", () => {
  it("formats whole percents without decimals", () => {
    expect(formatPercentFromBps(500)).toBe("5%");
    expect(formatPercentFromBps(10000)).toBe("100%");
  });

  it("formats fractional percents with a dot and no trailing zeros", () => {
    expect(formatPercentFromBps(250)).toBe("2.5%");
    expect(formatPercentFromBps(1225)).toBe("12.25%");
    expect(formatPercentFromBps(301)).toBe("3.01%");
  });

  it("formats small and zero rates", () => {
    expect(formatPercentFromBps(10)).toBe("0.1%");
    expect(formatPercentFromBps(0)).toBe("0%");
  });
});
