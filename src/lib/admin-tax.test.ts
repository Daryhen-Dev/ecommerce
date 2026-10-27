// Unit tests for the pure tax (IVA) admin logic: the register-a-rate form
// parser, the append-only and duplicate-date rules, the "rate in force vs
// scheduled" summary that delegates the selection to the domain
// `resolveVatRates`, and the Spanish labels/messages the page reuses.
//
// The rate in force is never recomputed here: the summary is asserted against
// the seed history (S1: STANDARD 1500 bps from 2024-04-01, ZERO_RATED 0 from
// 2000-01-01) and against a scheduled row that must NOT change it (S4/S7).

import { describe, expect, it } from "vitest";

import {
  INVALID_DATETIME_MESSAGE,
  PERCENT_FORMAT_MESSAGE,
  percentRangeMessage,
} from "./admin-fields";
import {
  BACKDATED_RATE_MESSAGE,
  DUPLICATE_RATE_DATE_MESSAGE,
  DUPLICATE_RATE_HISTORY_MESSAGE,
  EMPTY_TAX_RATE_RAW,
  INVALID_RATE_MESSAGE,
  NO_RATE_IN_FORCE_MESSAGE,
  RATE_DATE_REQUIRED_MESSAGE,
  RATE_IN_FORCE_LABEL,
  RATE_NOTE_MAX,
  RATE_SCHEDULED_LABEL,
  RATE_HISTORICAL_LABEL,
  RATE_SCHEDULED_NOTICE,
  parseTaxRateForm,
  summarizeTaxRates,
  taxErrorMessage,
  taxRateDateError,
  taxRateStatus,
  taxRateStatusLabel,
  type TaxRateHistoryEntry,
  type TaxRateRawFields,
} from "./admin-tax";

/** Raw fields of a valid submission; tests override what they probe. */
function rawRate(overrides: Partial<TaxRateRawFields> = {}): TaxRateRawFields {
  return {
    ...EMPTY_TAX_RATE_RAW,
    category: "STANDARD",
    ratePercent: "15",
    effectiveFrom: "2026-01-01T00:00",
    note: "",
    ...overrides,
  };
}

/** One stored row of the append-only history. */
function rate(
  category: "STANDARD" | "ZERO_RATED",
  rateBps: number,
  isoInstant: string,
): TaxRateHistoryEntry {
  return { category, rateBps, effectiveFrom: new Date(isoInstant) };
}

/** The history `prisma/seed.ts` leaves behind (S1). */
const SEED_HISTORY: TaxRateHistoryEntry[] = [
  rate("STANDARD", 1500, "2024-04-01T05:00:00.000Z"),
  rate("ZERO_RATED", 0, "2000-01-01T05:00:00.000Z"),
];

describe("parseTaxRateForm", () => {
  it("parses a dated rate into integer basis points and an instant", () => {
    const parsed = parseTaxRateForm(rawRate({ ratePercent: "15" }));

    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.values.category).toBe("STANDARD");
    // 15% -> 1500 bps (S1's rate), and the Ecuador wall clock becomes an instant.
    expect(parsed.values.rateBps).toBe(1500);
    expect(parsed.values.effectiveFrom.toISOString()).toBe("2026-01-01T05:00:00.000Z");
    expect(parsed.values.note).toBeNull();
  });

  it("keeps the zero rate of ZERO_RATED valid and trims the audit note", () => {
    const parsed = parseTaxRateForm(
      rawRate({ category: "ZERO_RATED", ratePercent: "0", note: "  Tarifa 0%  " }),
    );

    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.values.category).toBe("ZERO_RATED");
    expect(parsed.values.rateBps).toBe(0);
    expect(parsed.values.note).toBe("Tarifa 0%");
  });

  it("accepts a dot decimal percentage as basis points", () => {
    const parsed = parseTaxRateForm(rawRate({ ratePercent: "12.5" }));

    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.values.rateBps).toBe(1250);
  });

  it("refuses an unknown VAT category instead of defaulting to the standard rate", () => {
    const parsed = parseTaxRateForm(rawRate({ category: "REDUCED" }));

    expect(parsed.ok).toBe(false);
    if (parsed.ok) return;
    expect(parsed.fieldErrors).toEqual({
      category: "Elige una opción válida para el tipo de IVA.",
    });
  });

  it("refuses a missing percentage", () => {
    const parsed = parseTaxRateForm(rawRate({ ratePercent: " " }));

    expect(parsed.ok).toBe(false);
    if (parsed.ok) return;
    expect(parsed.fieldErrors.ratePercent).toBe("El porcentaje de IVA es obligatorio.");
  });

  it("refuses a comma decimal and a percentage above 100", () => {
    const comma = parseTaxRateForm(rawRate({ ratePercent: "12,5" }));
    expect(comma.ok).toBe(false);
    if (!comma.ok) {
      expect(comma.fieldErrors.ratePercent).toBe(PERCENT_FORMAT_MESSAGE);
    }

    const huge = parseTaxRateForm(rawRate({ ratePercent: "115" }));
    expect(huge.ok).toBe(false);
    if (!huge.ok) {
      expect(huge.fieldErrors.ratePercent).toBe(
        percentRangeMessage("porcentaje de IVA"),
      );
    }
  });

  it("requires the effective date and refuses an unreadable one", () => {
    const missing = parseTaxRateForm(rawRate({ effectiveFrom: "" }));
    expect(missing.ok).toBe(false);
    if (!missing.ok) {
      expect(missing.fieldErrors.effectiveFrom).toBe(RATE_DATE_REQUIRED_MESSAGE);
    }

    const malformed = parseTaxRateForm(rawRate({ effectiveFrom: "2026-02-30T18:00" }));
    expect(malformed.ok).toBe(false);
    if (!malformed.ok) {
      expect(malformed.fieldErrors.effectiveFrom).toBe(INVALID_DATETIME_MESSAGE);
    }
  });

  it("refuses a note longer than the audit-line limit", () => {
    const parsed = parseTaxRateForm(
      rawRate({ note: "x".repeat(RATE_NOTE_MAX + 1) }),
    );

    expect(parsed.ok).toBe(false);
    if (parsed.ok) return;
    expect(parsed.fieldErrors.note).toBe(
      `El texto de la nota no puede tener más de ${RATE_NOTE_MAX} caracteres.`,
    );
  });

  it("reports every invalid field in one pass", () => {
    const parsed = parseTaxRateForm(
      rawRate({ category: "nope", ratePercent: "abc", effectiveFrom: "" }),
    );

    expect(parsed.ok).toBe(false);
    if (parsed.ok) return;
    expect(Object.keys(parsed.fieldErrors).sort()).toEqual([
      "category",
      "effectiveFrom",
      "ratePercent",
    ]);
  });
});

describe("taxRateDateError (append-only history)", () => {
  it("accepts a date strictly later than the latest row of its category", () => {
    expect(
      taxRateDateError({
        category: "STANDARD",
        effectiveFrom: new Date("2026-01-01T05:00:00.000Z"),
        history: SEED_HISTORY,
      }),
    ).toBeNull();
  });

  it("accepts the first row of a category with no history", () => {
    expect(
      taxRateDateError({
        category: "STANDARD",
        effectiveFrom: new Date("2020-01-01T05:00:00.000Z"),
        history: [],
      }),
    ).toBeNull();
  });

  it("refuses a duplicate (category, effectiveFrom)", () => {
    expect(
      taxRateDateError({
        category: "STANDARD",
        effectiveFrom: new Date("2024-04-01T05:00:00.000Z"),
        history: SEED_HISTORY,
      }),
    ).toBe(DUPLICATE_RATE_DATE_MESSAGE);
  });

  it("allows the same instant in the other category", () => {
    expect(
      taxRateDateError({
        category: "ZERO_RATED",
        effectiveFrom: new Date("2030-01-01T05:00:00.000Z"),
        history: [...SEED_HISTORY, rate("STANDARD", 1500, "2030-01-01T05:00:00.000Z")],
      }),
    ).toBeNull();
  });

  it("refuses a backdated rate, because the history cannot retract it", () => {
    expect(
      taxRateDateError({
        category: "STANDARD",
        effectiveFrom: new Date("2020-01-01T05:00:00.000Z"),
        history: SEED_HISTORY,
      }),
    ).toBe(BACKDATED_RATE_MESSAGE);
  });

  it("measures 'later' only against the rows of the same category", () => {
    // ZERO_RATED already has a 2031 row; a 2026 STANDARD row is still later
    // than the latest STANDARD row (2024).
    expect(
      taxRateDateError({
        category: "STANDARD",
        effectiveFrom: new Date("2026-01-01T05:00:00.000Z"),
        history: [...SEED_HISTORY, rate("ZERO_RATED", 0, "2031-01-01T05:00:00.000Z")],
      }),
    ).toBeNull();
  });
});

describe("summarizeTaxRates (S4, S7)", () => {
  const AT = new Date("2025-06-01T12:00:00.000Z");

  it("reports the seeded rates in force with their dates", () => {
    const summary = summarizeTaxRates({ rates: SEED_HISTORY, at: AT });

    expect(summary.map((row) => row.category)).toEqual(["STANDARD", "ZERO_RATED"]);
    expect(summary[0].label).toBe("IVA estándar");
    expect(summary[0].inForce).toEqual({
      rateBps: 1500,
      effectiveFrom: new Date("2024-04-01T05:00:00.000Z"),
    });
    expect(summary[0].scheduled).toBeNull();
    expect(summary[0].formError).toBeNull();
    expect(summary[1].label).toBe("IVA 0%");
    expect(summary[1].inForce).toEqual({
      rateBps: 0,
      effectiveFrom: new Date("2000-01-01T05:00:00.000Z"),
    });
  });

  it("keeps the future row scheduled and the in-force rate unchanged", () => {
    const summary = summarizeTaxRates({
      rates: [...SEED_HISTORY, rate("STANDARD", 1200, "2030-01-01T05:00:00.000Z")],
      at: AT,
    });

    // S4: the selection is the greatest effectiveFrom <= at, never the newest row.
    expect(summary[0].inForce?.rateBps).toBe(1500);
    expect(summary[0].inForce?.effectiveFrom.toISOString()).toBe(
      "2024-04-01T05:00:00.000Z",
    );
    expect(summary[0].scheduled?.rateBps).toBe(1200);
    expect(summary[0].scheduled?.effectiveFrom.toISOString()).toBe(
      "2030-01-01T05:00:00.000Z",
    );
  });

  it("picks the nearest future row as the scheduled one", () => {
    const summary = summarizeTaxRates({
      rates: [
        ...SEED_HISTORY,
        rate("STANDARD", 1200, "2031-01-01T05:00:00.000Z"),
        rate("STANDARD", 1000, "2028-01-01T05:00:00.000Z"),
      ],
      at: AT,
    });

    expect(summary[0].scheduled?.rateBps).toBe(1000);
    expect(summary[0].scheduled?.effectiveFrom.toISOString()).toBe(
      "2028-01-01T05:00:00.000Z",
    );
  });

  it("resolves a rate exactly at its effectiveFrom instant", () => {
    const summary = summarizeTaxRates({
      rates: [...SEED_HISTORY, rate("STANDARD", 1200, "2026-01-01T05:00:00.000Z")],
      at: new Date("2026-01-01T05:00:00.000Z"),
    });

    expect(summary[0].inForce?.rateBps).toBe(1200);
    expect(summary[0].scheduled).toBeNull();
  });

  it("reports a Spanish sentence instead of a rate when none is in force", () => {
    const summary = summarizeTaxRates({
      rates: [rate("STANDARD", 1500, "2024-04-01T05:00:00.000Z")],
      at: AT,
    });

    expect(summary[0].inForce).toBeNull();
    expect(summary[1].inForce).toBeNull();
    expect(summary[1].formError).toBe(NO_RATE_IN_FORCE_MESSAGE);
  });

  it("reports a duplicated history entry with the Spanish sentence", () => {
    const duplicated = [
      ...SEED_HISTORY,
      rate("STANDARD", 1400, "2024-04-01T05:00:00.000Z"),
    ];
    const summary = summarizeTaxRates({ rates: duplicated, at: AT });

    expect(summary[0].formError).toBe(DUPLICATE_RATE_HISTORY_MESSAGE);
  });
});

describe("taxRateStatus", () => {
  const AT = new Date("2025-06-01T12:00:00.000Z");
  const IN_FORCE_FROM = new Date("2024-04-01T05:00:00.000Z");

  it("labels the row in force, a future row and an older row", () => {
    expect(
      taxRateStatus({
        rate: rate("STANDARD", 1500, "2024-04-01T05:00:00.000Z"),
        at: AT,
        inForceEffectiveFrom: IN_FORCE_FROM,
      }),
    ).toBe("IN_FORCE");
    expect(
      taxRateStatus({
        rate: rate("STANDARD", 1200, "2030-01-01T05:00:00.000Z"),
        at: AT,
        inForceEffectiveFrom: IN_FORCE_FROM,
      }),
    ).toBe("SCHEDULED");
    expect(
      taxRateStatus({
        rate: rate("STANDARD", 1400, "2023-01-01T05:00:00.000Z"),
        at: AT,
        inForceEffectiveFrom: IN_FORCE_FROM,
      }),
    ).toBe("HISTORICAL");
  });

  it("labels a future row scheduled even when no rate is in force yet", () => {
    expect(
      taxRateStatus({
        rate: rate("ZERO_RATED", 0, "2030-01-01T05:00:00.000Z"),
        at: AT,
        inForceEffectiveFrom: null,
      }),
    ).toBe("SCHEDULED");
  });

  it("uses the Spanish labels the panel renders", () => {
    expect(taxRateStatusLabel("IN_FORCE")).toBe(RATE_IN_FORCE_LABEL);
    expect(taxRateStatusLabel("SCHEDULED")).toBe(RATE_SCHEDULED_LABEL);
    expect(taxRateStatusLabel("HISTORICAL")).toBe(RATE_HISTORICAL_LABEL);
    expect(RATE_IN_FORCE_LABEL).toBe("En vigor");
    expect(RATE_SCHEDULED_LABEL).toBe("Programada");
    expect(RATE_HISTORICAL_LABEL).toBe("Anterior");
  });
});

describe("taxErrorMessage", () => {
  it("maps every domain TaxError code to a Spanish sentence", () => {
    expect(taxErrorMessage({ code: "NO_RATE_IN_EFFECT" })).toBe(
      NO_RATE_IN_FORCE_MESSAGE,
    );
    expect(taxErrorMessage({ code: "DUPLICATE_RATE" })).toBe(
      DUPLICATE_RATE_HISTORY_MESSAGE,
    );
    expect(taxErrorMessage({ code: "INVALID_RATE" })).toBe(INVALID_RATE_MESSAGE);
    expect(taxErrorMessage({ code: "INVALID_INSTANT" })).toBe(INVALID_DATETIME_MESSAGE);
  });

  it("rethrows an error that is not a tax error", () => {
    const other = new Error("boom");
    expect(() => taxErrorMessage(other)).toThrow(other);
  });
});

describe("tax module constants", () => {
  it("states that a scheduled rate does not apply yet (S7)", () => {
    expect(RATE_SCHEDULED_NOTICE).toBe(
      "Una tarifa programada todavía no se aplica: la tarifa vigente sigue cobrándose en la tienda hasta su fecha.",
    );
  });

  it("opens the register form on the standard category (S1)", () => {
    expect(EMPTY_TAX_RATE_RAW.category).toBe("STANDARD");
    expect(EMPTY_TAX_RATE_RAW.ratePercent).toBe("");
    expect(EMPTY_TAX_RATE_RAW.effectiveFrom).toBe("");
    expect(EMPTY_TAX_RATE_RAW.note).toBe("");
  });
});
