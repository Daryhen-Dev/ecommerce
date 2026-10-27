// Unit tests for the pure lot (desembarque) admin logic: form parsing with
// Spanish messages, the duplicate-landing rule and the insert shape.
//
// The module is pure (no React, no `server-only`, no Prisma), so these tests
// cover the whole contract: every field failure with its exact message, the
// Ecuador-day boundary of the duplicate rule, and the grams/status defaults
// a new lot always starts with.

import { describe, expect, it } from "vitest";

import {
  canCreateLot,
  ecuadorDayKey,
  formatWeightLabel,
  LOT_DUPLICATE_MESSAGE,
  LOT_MIN_TOTAL_GRAMS,
  LOT_NOTES_MAX,
  parseLotForm,
  toEcuadorDateTimeLocalValue,
  toLotInsert,
  type LotRawFields,
} from "./admin-lots";

const SPECIES_SLUGS = ["wahoo", "snapper"] as const;

/** Raw form values for a valid Wahoo landing; spread and override per test. */
function rawFields(overrides: Partial<LotRawFields> = {}): LotRawFields {
  return {
    species: "wahoo",
    landedAt: "2026-10-08T09:30",
    totalKg: "12.5",
    notes: "",
    ...overrides,
  };
}

/** Unwraps a successful parse or fails the test with the reported errors. */
function valuesOf(
  result: ReturnType<typeof parseLotForm>,
): { speciesSlug: string; landedAt: Date; totalGrams: number; notes: string | null } {
  if (!result.ok) {
    throw new Error(`expected a successful parse, got ${JSON.stringify(result.fieldErrors)}`);
  }
  return result.values;
}

/** Unwraps a failing parse, asserting one field message. */
function fieldErrorOf(
  result: ReturnType<typeof parseLotForm>,
  field: string,
  expected: string,
): void {
  if (result.ok) {
    throw new Error(`expected a failure, got ${JSON.stringify(result.values)}`);
  }
  expect(result.fieldErrors[field]).toBe(expected);
}

describe("parseLotForm", () => {
  it("parses a valid landing into grams and an Ecuador instant", () => {
    const values = valuesOf(parseLotForm(rawFields(), { speciesSlugs: SPECIES_SLUGS }));

    expect(values.speciesSlug).toBe("wahoo");
    expect(values.totalGrams).toBe(12_500);
    // 09:30 in Ecuador (UTC-5) is 14:30Z.
    expect(values.landedAt.toISOString()).toBe("2026-10-08T14:30:00.000Z");
    // An empty note is stored as null, never as "".
    expect(values.notes).toBeNull();
  });

  it("keeps the trimmed note when one is typed", () => {
    const values = valuesOf(
      parseLotForm(rawFields({ notes: "  E2E-lot-wahoo  " }), { speciesSlugs: SPECIES_SLUGS }),
    );

    expect(values.notes).toBe("E2E-lot-wahoo");
  });

  it("rejects a species that is not in the active list", () => {
    fieldErrorOf(
      parseLotForm(rawFields({ species: "dorado" }), { speciesSlugs: SPECIES_SLUGS }),
      "species",
      "Elige una opción válida para el desembarque.",
    );
  });

  it("rejects an unreadable landing date", () => {
    fieldErrorOf(
      parseLotForm(rawFields({ landedAt: "08/10/2026 09:30" }), { speciesSlugs: SPECIES_SLUGS }),
      "landedAt",
      "Fecha y hora inválidas.",
    );
  });

  it("rejects an empty weight", () => {
    fieldErrorOf(
      parseLotForm(rawFields({ totalKg: "" }), { speciesSlugs: SPECIES_SLUGS }),
      "totalKg",
      "El peso total es obligatorio.",
    );
  });

  it("rejects a comma decimal separator", () => {
    fieldErrorOf(
      parseLotForm(rawFields({ totalKg: "12,5" }), { speciesSlugs: SPECIES_SLUGS }),
      "totalKg",
      "Usa punto para decimales, ej. 7.5",
    );
  });

  it("rejects a zero weight", () => {
    fieldErrorOf(
      parseLotForm(rawFields({ totalKg: "0" }), { speciesSlugs: SPECIES_SLUGS }),
      "totalKg",
      "El peso total debe ser mayor que cero.",
    );
  });

  it("enforces the 0.5 kg minimum weight", () => {
    fieldErrorOf(
      parseLotForm(rawFields({ totalKg: "0.4" }), { speciesSlugs: SPECIES_SLUGS }),
      "totalKg",
      "El peso total mínimo es 0.5 kg",
    );
    // The boundary itself is valid: 0.5 kg is the smallest landing.
    const values = valuesOf(
      parseLotForm(rawFields({ totalKg: "0.5" }), { speciesSlugs: SPECIES_SLUGS }),
    );
    expect(values.totalGrams).toBe(LOT_MIN_TOTAL_GRAMS);
  });

  it("rejects a note longer than the limit", () => {
    fieldErrorOf(
      parseLotForm(rawFields({ notes: "x".repeat(LOT_NOTES_MAX + 1) }), {
        speciesSlugs: SPECIES_SLUGS,
      }),
      "notes",
      `El comentario no puede tener más de ${LOT_NOTES_MAX} caracteres.`,
    );
  });

  it("collects every field failure in one pass", () => {
    const result = parseLotForm(
      { species: "", landedAt: "", totalKg: "mucho", notes: "" },
      { speciesSlugs: SPECIES_SLUGS },
    );

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(Object.keys(result.fieldErrors).sort()).toEqual(
      ["landedAt", "species", "totalKg"].sort(),
    );
  });
});

describe("ecuadorDayKey", () => {
  it("groups instants by their Ecuador calendar day, not by UTC", () => {
    // 2026-10-09T02:00Z is still 2026-10-08 21:00 in Ecuador.
    expect(ecuadorDayKey(new Date("2026-10-09T02:00:00.000Z"))).toBe("2026-10-08");
    expect(ecuadorDayKey(new Date("2026-10-08T14:30:00.000Z"))).toBe("2026-10-08");
  });
});

describe("canCreateLot", () => {
  const morning = new Date("2026-10-08T14:30:00.000Z"); // 09:30 Ecuador
  const sameDayEvening = new Date("2026-10-08T23:00:00.000Z"); // 18:00 Ecuador
  const nextDayEarly = new Date("2026-10-09T05:30:00.000Z"); // 00:30 Ecuador next day

  it("accepts a landing when no OPEN lot matches", () => {
    expect(canCreateLot([], { landedAt: morning, totalGrams: 12_500 })).toBe(true);
  });

  it("rejects an identical species, day and weight", () => {
    expect(
      canCreateLot(
        [{ landedAt: morning, totalGrams: 12_500 }],
        { landedAt: sameDayEvening, totalGrams: 12_500 },
      ),
    ).toBe(false);
  });

  it("accepts the same day with a different weight", () => {
    expect(
      canCreateLot(
        [{ landedAt: morning, totalGrams: 12_500 }],
        { landedAt: sameDayEvening, totalGrams: 12_501 },
      ),
    ).toBe(true);
  });

  it("accepts the same weight on the next Ecuador day (day boundary)", () => {
    expect(
      canCreateLot(
        [{ landedAt: sameDayEvening, totalGrams: 12_500 }],
        { landedAt: nextDayEarly, totalGrams: 12_500 },
      ),
    ).toBe(true);
  });

  it("rejects the earliest and latest instants of the same Ecuador day", () => {
    // 2026-10-08T05:00Z is 00:00 Ecuador; 2026-10-09T04:59Z is 23:59 Ecuador.
    expect(
      canCreateLot(
        [{ landedAt: new Date("2026-10-08T05:00:00.000Z"), totalGrams: 12_500 }],
        { landedAt: new Date("2026-10-09T04:59:00.000Z"), totalGrams: 12_500 },
      ),
    ).toBe(false);
  });

  it("compares exact grams, so 12.5 kg and 12.500 kg collide", () => {
    expect(
      canCreateLot(
        [{ landedAt: morning, totalGrams: 12_500 }],
        { landedAt: morning, totalGrams: 12_500 },
      ),
    ).toBe(false);
    expect(
      canCreateLot(
        [{ landedAt: morning, totalGrams: 12_500 }],
        { landedAt: morning, totalGrams: 13_000 },
      ),
    ).toBe(true);
  });

  it("has a Spanish duplicate message ready for the form", () => {
    expect(LOT_DUPLICATE_MESSAGE).toBe("Ya existe un desembarque igual para esa fecha.");
  });
});

describe("toLotInsert", () => {
  it("always inserts an OPEN lot with zero reserved grams", () => {
    const values = valuesOf(parseLotForm(rawFields(), { speciesSlugs: SPECIES_SLUGS }));

    expect(toLotInsert(values, "species-id-1")).toEqual({
      speciesId: "species-id-1",
      landedAt: new Date("2026-10-08T14:30:00.000Z"),
      totalGrams: 12_500,
      reservedGrams: 0,
      status: "OPEN",
      notes: null,
    });
  });
});

describe("toEcuadorDateTimeLocalValue", () => {
  it("renders an instant as the datetime-local value an operator sees", () => {
    expect(toEcuadorDateTimeLocalValue(new Date("2026-10-08T23:00:00.000Z"))).toBe(
      "2026-10-08T18:00",
    );
    // Just before Ecuador midnight the value still belongs to the same day.
    expect(toEcuadorDateTimeLocalValue(new Date("2026-10-09T04:59:00.000Z"))).toBe(
      "2026-10-08T23:59",
    );
  });
});

describe("formatWeightLabel", () => {
  it("renders kilograms and keeps zero as a real label", () => {
    expect(formatWeightLabel(12_500)).toBe("12.5 kg");
    expect(formatWeightLabel(0)).toBe("0 kg");
  });
});
