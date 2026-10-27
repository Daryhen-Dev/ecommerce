// Unit tests for the shared admin form field parsers.
//
// Every parser takes the raw string a browser submits (`""` for a missing
// field) and returns either `{ ok: true, value }` or `{ ok: false, error }`
// with a Spanish message ready to render next to the input. The module is
// pure (no React, no server-only, no DOM), so these tests cover the whole
// contract: success paths, every failure path, boundaries and the exact
// messages.

import { describe, expect, it } from "vitest";

import {
  parseEcuadorDateTimeField,
  parseIntField,
  parseKgField,
  parsePercentField,
  parseSelectField,
  parseSlugField,
  parseTextField,
  parseUsdField,
  parseUsdPerKgField,
} from "./admin-fields";

/** Unwraps a successful parse or fails the test with the error message. */
function valueOf<T>(result: { ok: true; value: T } | { ok: false; error: string }): T {
  if (!result.ok) {
    throw new Error(`expected a successful parse, got error ${JSON.stringify(result.error)}`);
  }
  return result.value;
}

/** Unwraps a failing parse, asserting the exact Spanish message. */
function errorOf(
  result: { ok: true; value: unknown } | { ok: false; error: string },
  expected: string,
): void {
  if (result.ok) {
    throw new Error(`expected a failure, got value ${JSON.stringify(result.value)}`);
  }
  expect(result.error).toBe(expected);
}

describe("parseKgField", () => {
  it("parses kilograms with a dot into integer grams", () => {
    expect(valueOf(parseKgField("7.5"))).toBe(7500);
    expect(valueOf(parseKgField("120"))).toBe(120000);
    expect(valueOf(parseKgField("0.125"))).toBe(125);
    expect(valueOf(parseKgField("  2.25  "))).toBe(2250);
  });

  it("rejects empty and whitespace-only input", () => {
    errorOf(parseKgField(""), "El peso es obligatorio.");
    errorOf(parseKgField("   "), "El peso es obligatorio.");
  });

  it("rejects comma decimals and more than three decimals with the storefront message", () => {
    errorOf(parseKgField("7,5"), "Usa punto para decimales, ej. 7.5");
    errorOf(parseKgField("7.5001"), "Usa punto para decimales, ej. 7.5");
    errorOf(parseKgField("7.5 kg"), "Usa punto para decimales, ej. 7.5");
    errorOf(parseKgField("abc"), "Usa punto para decimales, ej. 7.5");
    errorOf(parseKgField("-7.5"), "Usa punto para decimales, ej. 7.5");
  });

  it("rejects zero because a weight is always positive", () => {
    errorOf(parseKgField("0"), "El peso debe ser mayor que cero.");
    errorOf(parseKgField("0.000"), "El peso debe ser mayor que cero.");
  });

  it("enforces the minimum and maximum in grams, formatted as kilograms", () => {
    const opts = { min: 7500, max: 25000 };
    expect(valueOf(parseKgField("7.5", opts))).toBe(7500);
    expect(valueOf(parseKgField("25", opts))).toBe(25000);
    errorOf(parseKgField("7.499", opts), "El peso mínimo es 7.5 kg");
    errorOf(parseKgField("25.001", opts), "El peso máximo es 25 kg");
  });

  it("uses the injected label in every message", () => {
    const opts = { label: "total", min: 1000, max: 2000 };
    errorOf(parseKgField("", opts), "El total es obligatorio.");
    errorOf(parseKgField("0", opts), "El total debe ser mayor que cero.");
    errorOf(parseKgField("0.5", opts), "El total mínimo es 1 kg");
    errorOf(parseKgField("3", opts), "El total máximo es 2 kg");
  });

  it("rejects amounts that overflow the safe integer range", () => {
    errorOf(parseKgField("99999999999999999"), "Usa punto para decimales, ej. 7.5");
  });
});

describe("parseUsdPerKgField", () => {
  it("parses USD per kg into integer cents", () => {
    expect(valueOf(parseUsdPerKgField("12.5"))).toBe(1250);
    expect(valueOf(parseUsdPerKgField("12.50"))).toBe(1250);
    expect(valueOf(parseUsdPerKgField("12"))).toBe(1200);
    expect(valueOf(parseUsdPerKgField("0.05"))).toBe(5);
  });

  it("accepts a dollar prefix, with or without a space", () => {
    expect(valueOf(parseUsdPerKgField("$12.50"))).toBe(1250);
    expect(valueOf(parseUsdPerKgField("$ 12.50"))).toBe(1250);
  });

  it("rejects more than two decimals", () => {
    errorOf(parseUsdPerKgField("12.505"), "Usa como máximo 2 decimales, ej. 12.50");
  });

  it("rejects negative and zero prices", () => {
    errorOf(parseUsdPerKgField("-5"), "El precio por kilo no puede ser negativo.");
    errorOf(parseUsdPerKgField("0"), "El precio por kilo debe ser mayor que cero.");
    errorOf(parseUsdPerKgField("0.00"), "El precio por kilo debe ser mayor que cero.");
  });

  it("rejects empty, non-numeric and comma decimals", () => {
    errorOf(parseUsdPerKgField(""), "El precio por kilo es obligatorio.");
    errorOf(parseUsdPerKgField("   "), "El precio por kilo es obligatorio.");
    errorOf(parseUsdPerKgField("abc"), "Usa punto para decimales, ej. 12.50");
    errorOf(parseUsdPerKgField("12,50"), "Usa punto para decimales, ej. 12.50");
    errorOf(parseUsdPerKgField("$"), "El precio por kilo es obligatorio.");
  });

  it("uses the injected label in every message", () => {
    const opts = { label: "precio" };
    expect(valueOf(parseUsdPerKgField("10", opts))).toBe(1000);
    errorOf(parseUsdPerKgField("", opts), "El precio es obligatorio.");
    errorOf(parseUsdPerKgField("0", opts), "El precio debe ser mayor que cero.");
    errorOf(parseUsdPerKgField("-1", opts), "El precio no puede ser negativo.");
  });
});

describe("parseUsdField", () => {
  it("parses USD into integer cents and allows zero", () => {
    expect(valueOf(parseUsdField("12.50"))).toBe(1250);
    expect(valueOf(parseUsdField("$12.50"))).toBe(1250);
    expect(valueOf(parseUsdField("1.5"))).toBe(150);
    expect(valueOf(parseUsdField("0"))).toBe(0);
  });

  it("enforces the optional cents floor", () => {
    expect(valueOf(parseUsdField("5", { minCents: 500 }))).toBe(500);
    errorOf(
      parseUsdField("4.99", { minCents: 500 }),
      "El monto mínimo es $5.00",
    );
    errorOf(
      parseUsdField("4.99", { minCents: 500, label: "total" }),
      "El total mínimo es $5.00",
    );
  });

  it("rejects negative, malformed and over-precise amounts", () => {
    errorOf(parseUsdField("-1"), "El monto no puede ser negativo.");
    errorOf(parseUsdField("1.234"), "Usa como máximo 2 decimales, ej. 12.50");
    errorOf(parseUsdField("1,00"), "Usa punto para decimales, ej. 12.50");
    errorOf(parseUsdField(""), "El monto es obligatorio.");
  });
});

describe("parseEcuadorDateTimeField", () => {
  it("interprets a datetime-local value in America/Guayaquil (UTC-5)", () => {
    const date = valueOf(parseEcuadorDateTimeField("2026-10-08T18:00"));
    expect(date.toISOString()).toBe("2026-10-08T23:00:00.000Z");
  });

  it("crosses the day boundary correctly near midnight", () => {
    const lateEvening = valueOf(parseEcuadorDateTimeField("2026-10-08T23:59"));
    expect(lateEvening.toISOString()).toBe("2026-10-09T04:59:00.000Z");

    const earlyMorning = valueOf(parseEcuadorDateTimeField("2026-10-08T00:30"));
    expect(earlyMorning.toISOString()).toBe("2026-10-08T05:30:00.000Z");
  });

  it("keeps the offset stable across the year (Ecuador has no DST)", () => {
    expect(valueOf(parseEcuadorDateTimeField("2026-01-15T09:00")).toISOString()).toBe(
      "2026-01-15T14:00:00.000Z",
    );
    expect(valueOf(parseEcuadorDateTimeField("2026-07-15T09:00")).toISOString()).toBe(
      "2026-07-15T14:00:00.000Z",
    );
  });

  it("accepts seconds when the input carries them", () => {
    expect(valueOf(parseEcuadorDateTimeField("2026-10-08T18:30:15")).toISOString()).toBe(
      "2026-10-08T23:30:15.000Z",
    );
  });

  it("rejects malformed values with a single message", () => {
    const message = "Fecha y hora inválidas.";
    for (const raw of [
      "",
      "   ",
      "2026-10-08",
      "2026-10-08 18:00",
      "18:00",
      "2026-10-08T18",
      "2026-10-08T18:00:00.123",
      "2026-10-08T25:00",
      "2026-10-08T18:60",
      "2026-13-08T18:00",
      "2026-02-30T18:00",
      "not a date",
    ]) {
      errorOf(parseEcuadorDateTimeField(raw), message);
    }
  });
});

describe("parseTextField", () => {
  it("trims and returns the text", () => {
    expect(valueOf(parseTextField("  Pargo rojo  "))).toBe("Pargo rojo");
  });

  it("is required by default", () => {
    errorOf(parseTextField(""), "El campo es obligatorio.");
    errorOf(parseTextField("    "), "El campo es obligatorio.");
  });

  it("accepts an empty value when the field is optional", () => {
    expect(valueOf(parseTextField("", { required: false }))).toBe("");
    expect(valueOf(parseTextField("  ", { required: false, label: "nota" }))).toBe("");
  });

  it("enforces the length limits on the trimmed value", () => {
    expect(valueOf(parseTextField("abc", { min: 3, max: 3 }))).toBe("abc");
    errorOf(parseTextField("ab", { min: 3, label: "nombre" }), "El nombre debe tener al menos 3 caracteres.");
    errorOf(
      parseTextField("abcd", { max: 3, label: "nombre", required: true }),
      "El nombre no puede tener más de 3 caracteres.",
    );
    errorOf(parseTextField("", { label: "nombre" }), "El nombre es obligatorio.");
  });
});

describe("parseSlugField", () => {
  it("accepts lowercase slugs with digits and dashes", () => {
    expect(valueOf(parseSlugField("pargo-rojo"))).toBe("pargo-rojo");
    expect(valueOf(parseSlugField("pargo-rojo-2"))).toBe("pargo-rojo-2");
    expect(valueOf(parseSlugField("  pargo  "))).toBe("pargo");
    expect(valueOf(parseSlugField("a".repeat(64)))).toBe("a".repeat(64));
  });

  it("rejects anything else with the slug message", () => {
    const message = "Usa solo letras minúsculas, números y guiones.";
    for (const raw of ["", "   ", "Pargo", "pargo_rojo", "pargo rojo", "pargo.rojo", "a".repeat(65)]) {
      errorOf(parseSlugField(raw), message);
    }
  });
});

describe("parseIntField", () => {
  it("parses safe integers, including negative and padded values", () => {
    expect(valueOf(parseIntField("5"))).toBe(5);
    expect(valueOf(parseIntField(" 42 "))).toBe(42);
    expect(valueOf(parseIntField("-7"))).toBe(-7);
    expect(valueOf(parseIntField("0", { min: 0 }))).toBe(0);
  });

  it("rejects empty input, decimals and non-numeric text", () => {
    errorOf(parseIntField(""), "El número es obligatorio.");
    errorOf(parseIntField("5.5"), "Usa números enteros, sin decimales.");
    errorOf(parseIntField("5,5"), "Usa números enteros, sin decimales.");
    errorOf(parseIntField("1e3"), "Usa números enteros, sin decimales.");
    errorOf(parseIntField("abc"), "Usa números enteros, sin decimales.");
  });

  it("enforces the inclusive min and max", () => {
    expect(valueOf(parseIntField("3", { min: 3, max: 10 }))).toBe(3);
    expect(valueOf(parseIntField("10", { min: 3, max: 10 }))).toBe(10);
    errorOf(parseIntField("2", { min: 3, max: 10 }), "El número mínimo es 3");
    errorOf(parseIntField("11", { min: 3, max: 10 }), "El número máximo es 10");
  });

  it("uses the injected label in every message", () => {
    const opts = { label: "umbral", min: 0, max: 10000 };
    errorOf(parseIntField("", opts), "El umbral es obligatorio.");
    errorOf(parseIntField("x", opts), "Usa números enteros, sin decimales.");
    errorOf(parseIntField("-1", opts), "El umbral mínimo es 0");
    errorOf(parseIntField("10001", opts), "El umbral máximo es 10000");
  });

  it("rejects integers outside the safe range", () => {
    errorOf(parseIntField("99999999999999999999"), "El número es demasiado grande.");
  });
});

describe("parseSelectField", () => {
  const ALLOWED = ["OPEN", "CLOSED"] as const;

  it("accepts one of the allowed values", () => {
    expect(valueOf(parseSelectField("OPEN", ALLOWED))).toBe("OPEN");
    expect(valueOf(parseSelectField("  CLOSED  ", ALLOWED))).toBe("CLOSED");
  });

  it("rejects unknown, empty and differently-cased values", () => {
    const message = "Elige una opción válida para el estado.";
    errorOf(parseSelectField("open", ALLOWED, { label: "estado" }), message);
    errorOf(parseSelectField("", ALLOWED, { label: "estado" }), message);
    errorOf(parseSelectField("SOLD_OUT", ALLOWED, { label: "estado" }), message);
  });

  it("uses the default label when none is injected", () => {
    errorOf(parseSelectField("OTHER", ALLOWED), "Elige una opción válida para el campo.");
  });
});

describe("parseKgField with allowZero", () => {
  it("accepts an explicit zero only when the caller allows it", () => {
    expect(valueOf(parseKgField("0", { allowZero: true }))).toBe(0);
    expect(valueOf(parseKgField("0.000", { allowZero: true }))).toBe(0);
  });

  it("still rejects zero by default (a weight exists)", () => {
    errorOf(parseKgField("0"), "El peso debe ser mayor que cero.");
  });

  it("keeps rejecting malformed input with the option on", () => {
    errorOf(parseKgField("1,5", { allowZero: true }), "Usa punto para decimales, ej. 7.5");
    errorOf(parseKgField("-1", { allowZero: true }), "Usa punto para decimales, ej. 7.5");
  });
});

describe("parsePercentField", () => {
  it("converts a percentage to basis points", () => {
    expect(valueOf(parsePercentField("8"))).toBe(800);
    expect(valueOf(parsePercentField("2.5"))).toBe(250);
    expect(valueOf(parsePercentField("2.25"))).toBe(225);
    expect(valueOf(parsePercentField("0"))).toBe(0);
    expect(valueOf(parsePercentField("100"))).toBe(10000);
    expect(valueOf(parsePercentField(" 12 "))).toBe(1200);
  });

  it("rejects an empty value with the labelled message", () => {
    errorOf(parsePercentField(""), "El porcentaje es obligatorio.");
    errorOf(parsePercentField("", { label: "descuento" }), "El descuento es obligatorio.");
  });

  it("rejects a comma, more than two decimals and negative values", () => {
    errorOf(parsePercentField("2,5"), "Usa punto para decimales, ej. 2.5");
    errorOf(parsePercentField("2.555"), "Usa punto para decimales, ej. 2.5");
    errorOf(parsePercentField("-5"), "Usa punto para decimales, ej. 2.5");
  });

  it("rejects a percentage above 100 with the labelled range message", () => {
    errorOf(parsePercentField("101", { label: "descuento" }), "El descuento debe estar entre 0 y 100.");
  });
});
