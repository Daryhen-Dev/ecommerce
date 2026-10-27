// Unit tests for the pure species (especies) admin logic: the create and edit
// form parsers, the tier-set rules, the season-window rules and the Spanish
// presentation labels. Every rule the panel enforces lives here, so the
// Server Actions only wire values to the database.

import { describe, expect, it } from "vitest";

import {
  CUSTOM_TIERS_REQUIRED_MESSAGE,
  DUPLICATE_TIER_MESSAGE,
  EMPTY_SPECIES_CREATE_RAW,
  EMPTY_SPECIES_EDIT_RAW,
  SEASON_END_BEFORE_START_MESSAGE,
  SEASONAL_WITHOUT_SEASON_MESSAGE,
  TIER_PERCENT_RANGE_MESSAGE,
  discountPolicyLabel,
  parseSeasonWindowForm,
  parseSpeciesCreateForm,
  parseSpeciesEditForm,
  parseTierRows,
  seasonalWithoutSeasonMessage,
  speciesTierFormError,
  toKgInputValue,
  toPercentInputValue,
  toPriceInputValue,
  toSpeciesEditRaw,
  toTierRawRows,
  vatCategoryLabel,
  zipTierColumns,
} from "./admin-species";

/** Raw fields of a valid create submission; tests override what they probe. */
function validCreateRaw(overrides: Partial<typeof EMPTY_SPECIES_CREATE_RAW> = {}) {
  return {
    ...EMPTY_SPECIES_CREATE_RAW,
    slug: "yellowfin-tuna",
    name: "Atún aleta amarilla",
    description: "Atún fresco.",
    pricePerKg: "11.50",
    minOrderKg: "1",
    orderStepKg: "0.5",
    discountPolicy: "GLOBAL",
    vatCategory: "STANDARD",
    isSeasonal: "",
    ...overrides,
  };
}

function validEditRaw(overrides: Partial<typeof EMPTY_SPECIES_EDIT_RAW> = {}) {
  return {
    ...EMPTY_SPECIES_EDIT_RAW,
    name: "Pargo",
    description: "Pargo colorado.",
    pricePerKg: "12",
    minOrderKg: "1",
    orderStepKg: "0.5",
    discountPolicy: "CUSTOM",
    vatCategory: "STANDARD",
    isSeasonal: "",
    ...overrides,
  };
}

describe("parseSpeciesCreateForm", () => {
  it("parses a complete species into cents, grams and enums", () => {
    const parsed = parseSpeciesCreateForm(validCreateRaw());

    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.values).toEqual({
      slug: "yellowfin-tuna",
      name: "Atún aleta amarilla",
      description: "Atún fresco.",
      pricePerKgCents: 1150,
      minOrderGrams: 1000,
      orderStepGrams: 500,
      discountPolicy: "GLOBAL",
      vatCategory: "STANDARD",
      isSeasonal: false,
    });
  });

  it("accepts a dollar sign and trims the fields", () => {
    const parsed = parseSpeciesCreateForm(
      validCreateRaw({ pricePerKg: " $12.50 ", name: "  Wahoo  " }),
    );

    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.values.pricePerKgCents).toBe(1250);
    expect(parsed.values.name).toBe("Wahoo");
  });

  it("treats an empty description as absent", () => {
    const parsed = parseSpeciesCreateForm(validCreateRaw({ description: "   " }));

    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.values.description).toBeNull();
  });

  it("reports every invalid field at once", () => {
    const parsed = parseSpeciesCreateForm(
      validCreateRaw({ slug: "Wahoo Frito", name: "", pricePerKg: "0" }),
    );

    expect(parsed.ok).toBe(false);
    if (parsed.ok) return;
    expect(Object.keys(parsed.fieldErrors).sort()).toEqual([
      "name",
      "pricePerKg",
      "slug",
    ]);
    expect(parsed.fieldErrors.slug).toBe(
      "Usa solo letras minúsculas, números y guiones.",
    );
    expect(parsed.fieldErrors.name).toBe("El nombre es obligatorio.");
    expect(parsed.fieldErrors.pricePerKg).toBe(
      "El precio por kilo debe ser mayor que cero.",
    );
  });

  it("rejects a comma decimal separator", () => {
    const parsed = parseSpeciesCreateForm(validCreateRaw({ pricePerKg: "12,50" }));

    expect(parsed.ok).toBe(false);
    if (parsed.ok) return;
    expect(parsed.fieldErrors.pricePerKg).toBe(
      "Usa punto para decimales, ej. 12.50",
    );
  });

  it("reads the seasonal checkbox from the submitted value", () => {
    expect(parseSpeciesCreateForm(validCreateRaw({ isSeasonal: "on" }))).toMatchObject({
      ok: true,
      values: { isSeasonal: true },
    });
    expect(parseSpeciesCreateForm(validCreateRaw({ isSeasonal: "" }))).toMatchObject({
      ok: true,
      values: { isSeasonal: false },
    });
  });

  it("rejects an unknown discount policy or VAT category", () => {
    const parsed = parseSpeciesCreateForm(
      validCreateRaw({ discountPolicy: "TIERS", vatCategory: "REDUCED" }),
    );

    expect(parsed.ok).toBe(false);
    if (parsed.ok) return;
    expect(parsed.fieldErrors.discountPolicy).toBe(
      "Elige una opción válida para el tipo de descuento.",
    );
    expect(parsed.fieldErrors.vatCategory).toBe(
      "Elige una opción válida para el tipo de IVA.",
    );
  });

  it("bounds the minimum order and the step to the grams column", () => {
    const parsed = parseSpeciesCreateForm(
      validCreateRaw({ minOrderKg: "2000", orderStepKg: "0" }),
    );

    expect(parsed.ok).toBe(false);
    if (parsed.ok) return;
    expect(parsed.fieldErrors.minOrderKg).toBe(
      "El pedido mínimo máximo es 1000 kg",
    );
    expect(parsed.fieldErrors.orderStepKg).toBe(
      "El paso del pedido debe ser mayor que cero.",
    );
  });
});

describe("parseSpeciesEditForm", () => {
  it("parses an edit without ever reading a slug (the slug is immutable)", () => {
    const parsed = parseSpeciesEditForm(
      // A tampered form sends a slug; the edit parser must not expose it.
      { ...validEditRaw(), slug: "otro-slug" } as never,
    );

    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.values).not.toHaveProperty("slug");
    expect(parsed.values.pricePerKgCents).toBe(1200);
  });

  it("reports a missing name on edit too", () => {
    const parsed = parseSpeciesEditForm(validEditRaw({ name: "  " }));

    expect(parsed.ok).toBe(false);
    if (parsed.ok) return;
    expect(parsed.fieldErrors.name).toBe("El nombre es obligatorio.");
  });
});

describe("parseTierRows", () => {
  it("parses thresholds in kg and discounts in percent, sorted by threshold", () => {
    const parsed = parseTierRows([
      { minTotalKg: "8", discountPercent: "8" },
      { minTotalKg: "0", discountPercent: "0" },
      { minTotalKg: "2.5", discountPercent: "2.5" },
    ]);

    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.tiers).toEqual([
      { minTotalGrams: 0, discountBps: 0 },
      { minTotalGrams: 2500, discountBps: 250 },
      { minTotalGrams: 8000, discountBps: 800 },
    ]);
  });

  it("treats rows with both fields empty as unused rows", () => {
    const parsed = parseTierRows([
      { minTotalKg: "3", discountPercent: "3" },
      { minTotalKg: "", discountPercent: "" },
    ]);

    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.tiers).toEqual([{ minTotalGrams: 3000, discountBps: 300 }]);
  });

  it("rejects a half-filled row", () => {
    const parsed = parseTierRows([{ minTotalKg: "3", discountPercent: "" }]);

    expect(parsed.ok).toBe(false);
    if (parsed.ok) return;
    expect(parsed.fieldErrors["tier-0-discountPercent"]).toBe(
      "El descuento es obligatorio.",
    );
  });

  it("rejects a discount above 100 percent", () => {
    const parsed = parseTierRows([{ minTotalKg: "3", discountPercent: "101" }]);

    expect(parsed.ok).toBe(false);
    if (parsed.ok) return;
    expect(parsed.fieldErrors["tier-0-discountPercent"]).toBe(
      TIER_PERCENT_RANGE_MESSAGE,
    );
  });

  it("refuses two tiers with the same threshold", () => {
    const parsed = parseTierRows([
      { minTotalKg: "3", discountPercent: "3" },
      { minTotalKg: "3", discountPercent: "5" },
    ]);

    expect(parsed.ok).toBe(false);
    if (parsed.ok) return;
    expect(parsed.formError).toBe(DUPLICATE_TIER_MESSAGE);
  });

  it("keeps a zero threshold zero: the first tier is a discount from 0 kg", () => {
    const parsed = parseTierRows([{ minTotalKg: "0", discountPercent: "0" }]);

    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.tiers).toEqual([{ minTotalGrams: 0, discountBps: 0 }]);
  });
});

describe("speciesTierFormError", () => {
  it("requires at least one tier for a CUSTOM policy", () => {
    expect(
      speciesTierFormError({ discountPolicy: "CUSTOM", tiers: [] }),
    ).toBe(CUSTOM_TIERS_REQUIRED_MESSAGE);
    expect(CUSTOM_TIERS_REQUIRED_MESSAGE).toBe(
      "La política de tramos propios necesita al menos un tramo.",
    );
  });

  it("accepts a CUSTOM policy that owns tiers", () => {
    expect(
      speciesTierFormError({
        discountPolicy: "CUSTOM",
        tiers: [{ minTotalGrams: 0, discountBps: 0 }],
      }),
    ).toBeNull();
  });

  it("never demands tiers from a GLOBAL or NONE species", () => {
    expect(speciesTierFormError({ discountPolicy: "GLOBAL", tiers: [] })).toBeNull();
    expect(speciesTierFormError({ discountPolicy: "NONE", tiers: [] })).toBeNull();
  });
});

describe("parseSeasonWindowForm", () => {
  it("parses an Ecuador wall-clock window", () => {
    const parsed = parseSeasonWindowForm({
      startsAt: "2026-01-01T00:00",
      endsAt: "2026-03-31T23:59",
    });

    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.window.startsAt.toISOString()).toBe("2026-01-01T05:00:00.000Z");
    expect(parsed.window.endsAt.toISOString()).toBe("2026-04-01T04:59:00.000Z");
  });

  it("accepts a zero-length window (same start and end)", () => {
    const parsed = parseSeasonWindowForm({
      startsAt: "2026-01-01T00:00",
      endsAt: "2026-01-01T00:00",
    });

    expect(parsed.ok).toBe(true);
  });

  it("rejects an end before the start", () => {
    const parsed = parseSeasonWindowForm({
      startsAt: "2026-03-01T00:00",
      endsAt: "2026-02-01T00:00",
    });

    expect(parsed.ok).toBe(false);
    if (parsed.ok) return;
    expect(parsed.fieldErrors.endsAt).toBe(SEASON_END_BEFORE_START_MESSAGE);
  });

  it("reports a missing date per field", () => {
    const parsed = parseSeasonWindowForm({ startsAt: "", endsAt: "" });

    expect(parsed.ok).toBe(false);
    if (parsed.ok) return;
    expect(parsed.fieldErrors.startsAt).toBe("Fecha y hora inválidas.");
    expect(parsed.fieldErrors.endsAt).toBe("Fecha y hora inválidas.");
  });
});

describe("seasonalWithoutSeasonMessage", () => {
  it("warns when a seasonal species has no window", () => {
    expect(seasonalWithoutSeasonMessage({ isSeasonal: true, seasonCount: 0 })).toBe(
      SEASONAL_WITHOUT_SEASON_MESSAGE,
    );
  });

  it("stays quiet for a non-seasonal species or an existing window", () => {
    expect(seasonalWithoutSeasonMessage({ isSeasonal: false, seasonCount: 0 })).toBeNull();
    expect(seasonalWithoutSeasonMessage({ isSeasonal: true, seasonCount: 1 })).toBeNull();
  });
});

describe("presentation labels", () => {
  it("labels the discount policies in Spanish", () => {
    expect(discountPolicyLabel("GLOBAL")).toBe("Tramos generales");
    expect(discountPolicyLabel("CUSTOM")).toBe("Tramos propios");
    expect(discountPolicyLabel("NONE")).toBe("Sin descuento");
  });

  it("labels the VAT categories in Spanish", () => {
    expect(vatCategoryLabel("STANDARD")).toBe("IVA estándar");
    expect(vatCategoryLabel("ZERO_RATED")).toBe("IVA 0%");
  });
});

describe("form input formatting", () => {
  it("formats cents as a price input value", () => {
    expect(toPriceInputValue(900)).toBe("9");
    expect(toPriceInputValue(1250)).toBe("12.5");
    expect(toPriceInputValue(1105)).toBe("11.05");
    expect(toPriceInputValue(1)).toBe("0.01");
  });

  it("formats grams as a kg input value", () => {
    expect(toKgInputValue(1000)).toBe("1");
    expect(toKgInputValue(2500)).toBe("2.5");
    expect(toKgInputValue(125)).toBe("0.125");
    expect(toKgInputValue(0)).toBe("0");
  });

  it("formats basis points as a percent input value", () => {
    expect(toPercentInputValue(800)).toBe("8");
    expect(toPercentInputValue(250)).toBe("2.5");
    expect(toPercentInputValue(0)).toBe("0");
    expect(toPercentInputValue(10000)).toBe("100");
  });
});

describe("edit prefill round trip", () => {
  it("prefills the edit form so it parses back to the stored species", () => {
    const stored = {
      name: "Pargo",
      description: "Pargo colorado.",
      pricePerKgCents: 1205,
      minOrderGrams: 2500,
      orderStepGrams: 125,
      discountPolicy: "CUSTOM" as const,
      vatCategory: "STANDARD" as const,
      isSeasonal: true,
    };

    const parsed = parseSpeciesEditForm(toSpeciesEditRaw(stored));

    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.values).toEqual(stored);
  });

  it("prefills a species with no description as an empty field", () => {
    const raw = toSpeciesEditRaw({
      name: "Wahoo",
      description: null,
      pricePerKgCents: 900,
      minOrderGrams: 1000,
      orderStepGrams: 500,
      discountPolicy: "GLOBAL",
      vatCategory: "ZERO_RATED",
      isSeasonal: false,
    });

    expect(raw.description).toBe("");
    expect(raw.isSeasonal).toBe("");
  });

  it("prefills tier rows so they parse back to the stored tiers", () => {
    const stored = [
      { minTotalGrams: 0, discountBps: 0 },
      { minTotalGrams: 3000, discountBps: 300 },
      { minTotalGrams: 8000, discountBps: 800 },
    ];

    const parsed = parseTierRows(toTierRawRows(stored));

    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.tiers).toEqual(stored);
  });
});

describe("zipTierColumns", () => {
  it("pairs the two submitted columns", () => {
    expect(zipTierColumns(["0", "3"], ["0", "3"])).toEqual([
      { minTotalKg: "0", discountPercent: "0" },
      { minTotalKg: "3", discountPercent: "3" },
    ]);
  });

  it("turns a missing partner into an empty value instead of shifting rows", () => {
    expect(zipTierColumns(["0", "3"], ["0"])).toEqual([
      { minTotalKg: "0", discountPercent: "0" },
      { minTotalKg: "3", discountPercent: "" },
    ]);
  });

  it("returns no rows when both columns are empty", () => {
    expect(zipTierColumns([], [])).toEqual([]);
  });
});
