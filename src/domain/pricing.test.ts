import { describe, it, expect } from "vitest";
import { cents } from "./money";
import { grams } from "./weight";
import {
  priceOrder,
  PricingError,
  type PricingInput,
  type PricingLineInput,
  type VatCategory,
} from "./pricing";

const globalTiers = [
  { minTotalGrams: 0, discountBps: 0 },
  { minTotalGrams: 5000, discountBps: 500 },
  { minTotalGrams: 10000, discountBps: 1000 },
];

const vatRates = { STANDARD: 1500, ZERO_RATED: 0 };

function line(overrides: Partial<PricingLineInput> = {}): PricingLineInput {
  return {
    speciesId: "pargo",
    grams: grams(3000),
    pricePerKgCents: cents(1000),
    discountPolicy: "GLOBAL",
    vatCategory: "STANDARD",
    ...overrides,
  };
}

function input(overrides: Partial<PricingInput> = {}): PricingInput {
  return {
    lines: [line()],
    globalTiers,
    vatRatesBps: vatRates,
    ...overrides,
  };
}

function errorCode(run: () => unknown): string {
  try {
    run();
  } catch (error) {
    expect(error).toBeInstanceOf(PricingError);
    return (error as PricingError).code;
  }
  throw new Error("expected priceOrder to throw");
}

describe("single GLOBAL line below the first discount tier", () => {
  // 3 kg x $10.00/kg: gross = 3000 g * 1000 c/kg = 3_000_000 g-c / 1000 = 3000 c.
  // Total 3000 g -> tier 0 -> 0 bps. VAT 15% of 3000 = 450 exactly.
  it("prices 3 kg x $10.00/kg as gross 3000, discount 0, vat 450, total 3450", () => {
    const quote = priceOrder(input());
    expect(quote.totalGrams).toBe(3000);
    expect(quote.subtotalCents).toBe(3000);
    expect(quote.discountCents).toBe(0);
    expect(quote.vatCents).toBe(450);
    expect(quote.totalCents).toBe(3450);
    expect(quote.lines).toHaveLength(1);
    expect(quote.lines[0]).toMatchObject({
      speciesId: "pargo",
      grams: 3000,
      pricePerKgCents: 1000,
      discountBps: 0,
      vatRateBps: 1500,
      grossCents: 3000,
      discountCents: 0,
      vatCents: 450,
      lineTotalCents: 3450,
    });
  });
});

describe("tier selection uses the order total across species", () => {
  // Owner's example (a): 3 kg pargo ($8.00/kg) + 6 kg atún ($6.00/kg) = 9 kg.
  // 9000 g -> global tier 5000 -> 500 bps for BOTH lines.
  it("gives both lines 500 bps at 9 kg order total", () => {
    const quote = priceOrder(
      input({
        lines: [
          line({ speciesId: "pargo", grams: grams(3000), pricePerKgCents: cents(800) }),
          line({ speciesId: "atun", grams: grams(6000), pricePerKgCents: cents(600) }),
        ],
      }),
    );
    expect(quote.totalGrams).toBe(9000);
    expect(quote.lines[0].discountBps).toBe(500);
    expect(quote.lines[1].discountBps).toBe(500);
    // pargo: gross (3000*800+500)/1000 = 2400; discount (2400*500+5000)/10000 = 120;
    // vat (2280*1500+5000)/10000 = 342.
    expect(quote.lines[0]).toMatchObject({
      grossCents: 2400,
      discountCents: 120,
      vatCents: 342,
      lineTotalCents: 2622,
    });
    // atún: gross (6000*600+500)/1000 = 3600; discount 180; vat (3420*1500+5000)/10000 = 513.
    expect(quote.lines[1]).toMatchObject({
      grossCents: 3600,
      discountCents: 180,
      vatCents: 513,
      lineTotalCents: 3933,
    });
    expect(quote.subtotalCents).toBe(6000);
    expect(quote.discountCents).toBe(300);
    expect(quote.vatCents).toBe(855);
    expect(quote.totalCents).toBe(6555);
  });

  // CUSTOM corvina has tiers [{5000 -> 800}]; order total is 6000 g even though
  // corvina itself is only 4000 g, so corvina gets 800 bps. The GLOBAL pargo
  // line (2000 g of the same 6000 g order) uses the global tiers -> 500 bps.
  it("CUSTOM tiers are selected by order total while GLOBAL lines use global tiers", () => {
    const quote = priceOrder(
      input({
        lines: [
          line({
            speciesId: "corvina",
            grams: grams(4000),
            pricePerKgCents: cents(1000),
            discountPolicy: "CUSTOM",
            customTiers: [{ minTotalGrams: 5000, discountBps: 800 }],
          }),
          line({ speciesId: "pargo", grams: grams(2000), pricePerKgCents: cents(800) }),
        ],
      }),
    );
    expect(quote.totalGrams).toBe(6000);
    expect(quote.lines[0].discountBps).toBe(800);
    expect(quote.lines[1].discountBps).toBe(500);
    // corvina: gross 4000; discount (4000*800+5000)/10000 = 320; vat (3680*1500+5000)/10000 = 552.
    expect(quote.lines[0]).toMatchObject({
      grossCents: 4000,
      discountCents: 320,
      vatCents: 552,
      lineTotalCents: 4232,
    });
    // pargo: gross 1600; discount 80; vat (1520*1500+5000)/10000 = 228.
    expect(quote.lines[1]).toMatchObject({
      grossCents: 1600,
      discountCents: 80,
      vatCents: 228,
      lineTotalCents: 1748,
    });
    expect(quote.totalCents).toBe(5980);
  });
});

describe("NONE policy is never discounted", () => {
  // Lobster (5 kg) + pargo (5 kg) = 10 kg order total: pargo reaches the
  // 10000 g global tier (1000 bps), lobster stays at 0 bps.
  it("keeps lobster at 0 bps even at a 10 kg order total", () => {
    const quote = priceOrder(
      input({
        lines: [
          line({ speciesId: "langosta", grams: grams(5000), pricePerKgCents: cents(2000), discountPolicy: "NONE" }),
          line({ speciesId: "pargo", grams: grams(5000), pricePerKgCents: cents(800) }),
        ],
      }),
    );
    expect(quote.totalGrams).toBe(10000);
    expect(quote.lines[0].discountBps).toBe(0);
    expect(quote.lines[0].discountCents).toBe(0);
    expect(quote.lines[1].discountBps).toBe(1000);
    // langosta: gross 10000, discount 0, vat (10000*1500+5000)/10000 = 1500.
    expect(quote.lines[0]).toMatchObject({
      grossCents: 10000,
      vatCents: 1500,
      lineTotalCents: 11500,
    });
    // pargo: gross 4000, discount 400, vat (3600*1500+5000)/10000 = 540.
    expect(quote.lines[1]).toMatchObject({
      grossCents: 4000,
      discountCents: 400,
      vatCents: 540,
      lineTotalCents: 4140,
    });
    expect(quote.totalCents).toBe(15640);
  });
});

describe("VAT by category, never hardcoded", () => {
  const tiers = [{ minTotalGrams: 0, discountBps: 0 }];

  // corvina ZERO_RATED 2 kg x $9/kg -> gross 1800, vat 0.
  // pargo STANDARD 2 kg x $8/kg -> gross 1600, vat 15% of 1600 = 240.
  it("applies 0% to ZERO_RATED and the configured rate to STANDARD in the same order", () => {
    const quote = priceOrder(
      input({
        lines: [
          line({ speciesId: "corvina", grams: grams(2000), pricePerKgCents: cents(900), vatCategory: "ZERO_RATED" }),
          line({ speciesId: "pargo", grams: grams(2000), pricePerKgCents: cents(800) }),
        ],
        globalTiers: tiers,
      }),
    );
    expect(quote.lines[0].vatRateBps).toBe(0);
    expect(quote.lines[0].vatCents).toBe(0);
    expect(quote.lines[1].vatRateBps).toBe(1500);
    expect(quote.lines[1].vatCents).toBe(240);
    expect(quote.vatCents).toBe(240);
    expect(quote.totalCents).toBe(3400 + 0 + 240 - 0);
  });

  it("changes the VAT when the configured STANDARD rate changes to 1200 bps", () => {
    // gross 3000 -> vat (3000*1200+5000)/10000 = 360 (not 450).
    const quote = priceOrder(input({ vatRatesBps: { STANDARD: 1200, ZERO_RATED: 0 } }));
    expect(quote.lines[0].vatRateBps).toBe(1200);
    expect(quote.lines[0].vatCents).toBe(360);
    expect(quote.totalCents).toBe(3360);
  });
});

describe("rounding half up on gross", () => {
  // 7.5 kg x $12.35/kg: 7500 g * 1235 c/kg = 9_262_500 g-c; /1000 = 9262.5;
  // round half up -> 9263 c gross. VAT 15% of 9263 = 1389.45 -> 1389.
  it("rounds 9262.5 up to 9263 cents", () => {
    const quote = priceOrder(
      input({
        lines: [line({ grams: grams(7500), pricePerKgCents: cents(1235) })],
        globalTiers: [{ minTotalGrams: 0, discountBps: 0 }],
      }),
    );
    expect(quote.lines[0].grossCents).toBe(9263);
    expect(quote.lines[0].vatCents).toBe(1389);
    expect(quote.lines[0].lineTotalCents).toBe(10652);
  });
});

describe("tier boundary is inclusive", () => {
  it("gives an order of exactly 5000 g the 5000-gram tier", () => {
    const quote = priceOrder(input({ lines: [line({ grams: grams(5000) })] }));
    expect(quote.lines[0].discountBps).toBe(500);
    // gross 5000; discount (5000*500+5000)/10000 = 250.
    expect(quote.lines[0].discountCents).toBe(250);
  });

  it("gives no tier when none matches (empty tiers -> 0 bps)", () => {
    const quote = priceOrder(input({ globalTiers: [] }));
    expect(quote.lines[0].discountBps).toBe(0);
    expect(quote.lines[0].discountCents).toBe(0);
  });
});

describe("output shape", () => {
  it("keeps lines in input order and asserts totalCents equals the sum of line totals", () => {
    const lines = [
      line({ speciesId: "atun", grams: grams(2000), pricePerKgCents: cents(600) }),
      line({ speciesId: "pargo", grams: grams(1000), pricePerKgCents: cents(800) }),
    ];
    const quote = priceOrder(input({ lines, globalTiers: [] }));
    expect(quote.lines.map((l) => l.speciesId)).toEqual(["atun", "pargo"]);
    const sumOfLineTotals = quote.lines.reduce((acc, l) => acc + l.lineTotalCents, 0);
    expect(quote.totalCents).toBe(sumOfLineTotals);
    expect(quote.totalCents).toBe(quote.subtotalCents - quote.discountCents + quote.vatCents);
  });

  it("does not mutate the input tier lists and handles unsorted tiers", () => {
    const customTiers = [
      { minTotalGrams: 10000, discountBps: 1000 },
      { minTotalGrams: 5000, discountBps: 500 },
    ];
    const tiersInput = [...customTiers];
    const globalInput = [
      { minTotalGrams: 10000, discountBps: 1000 },
      { minTotalGrams: 0, discountBps: 0 },
      { minTotalGrams: 5000, discountBps: 500 },
    ];
    const quote = priceOrder(
      input({
        lines: [
          line({ speciesId: "corvina", grams: grams(3000), pricePerKgCents: cents(1000), discountPolicy: "CUSTOM", customTiers }),
          line({ grams: grams(2000), pricePerKgCents: cents(800) }),
        ],
        globalTiers: globalInput,
      }),
    );
    expect(tiersInput).toEqual(customTiers);
    // 5000 g order total -> both lines at 500 bps.
    expect(quote.lines[0].discountBps).toBe(500);
    expect(quote.lines[1].discountBps).toBe(500);
    // Same result when tiers arrive pre-sorted.
    const sorted = priceOrder(
      input({
        lines: [
          line({ speciesId: "corvina", grams: grams(3000), pricePerKgCents: cents(1000), discountPolicy: "CUSTOM", customTiers: [...customTiers].sort((a, b) => a.minTotalGrams - b.minTotalGrams) }),
          line({ grams: grams(2000), pricePerKgCents: cents(800) }),
        ],
        globalTiers: [...globalInput].sort((a, b) => a.minTotalGrams - b.minTotalGrams),
      }),
    );
    expect(sorted).toEqual(quote);
  });
});

describe("validation errors", () => {
  it("rejects an empty line list with EMPTY_LINES", () => {
    expect(errorCode(() => priceOrder(input({ lines: [] })))).toBe("EMPTY_LINES");
  });

  it("rejects CUSTOM without customTiers with CUSTOM_TIERS_REQUIRED", () => {
    expect(
      errorCode(() =>
        priceOrder(input({ lines: [line({ discountPolicy: "CUSTOM" })] })),
      ),
    ).toBe("CUSTOM_TIERS_REQUIRED");
    expect(
      errorCode(() =>
        priceOrder(
          input({ lines: [line({ discountPolicy: "CUSTOM", customTiers: [] })] }),
        ),
      ),
    ).toBe("CUSTOM_TIERS_REQUIRED");
  });

  it("rejects invalid tiers with INVALID_TIER", () => {
    expect(
      errorCode(() => priceOrder(input({ globalTiers: [{ minTotalGrams: -1, discountBps: 0 }] }))),
    ).toBe("INVALID_TIER");
    expect(
      errorCode(() => priceOrder(input({ globalTiers: [{ minTotalGrams: 5000, discountBps: 10001 }] }))),
    ).toBe("INVALID_TIER");
    expect(
      errorCode(() => priceOrder(input({ globalTiers: [{ minTotalGrams: 5000.5, discountBps: 0 }] }))),
    ).toBe("INVALID_TIER");
    expect(
      errorCode(() => priceOrder(input({ globalTiers: [{ minTotalGrams: 0, discountBps: -1 }] }))),
    ).toBe("INVALID_TIER");
    expect(
      errorCode(() =>
        priceOrder(
          input({
            lines: [line({ discountPolicy: "CUSTOM", customTiers: [{ minTotalGrams: 0, discountBps: 12.5 }] })],
          }),
        ),
      ),
    ).toBe("INVALID_TIER");
  });

  it("rejects duplicate thresholds with DUPLICATE_TIER_THRESHOLD", () => {
    expect(
      errorCode(() =>
        priceOrder(
          input({
            globalTiers: [
              { minTotalGrams: 5000, discountBps: 500 },
              { minTotalGrams: 5000, discountBps: 800 },
            ],
          }),
        ),
      ),
    ).toBe("DUPLICATE_TIER_THRESHOLD");
    expect(
      errorCode(() =>
        priceOrder(
          input({
            lines: [
              line({
                discountPolicy: "CUSTOM",
                customTiers: [
                  { minTotalGrams: 5000, discountBps: 500 },
                  { minTotalGrams: 5000, discountBps: 800 },
                ],
              }),
            ],
          }),
        ),
      ),
    ).toBe("DUPLICATE_TIER_THRESHOLD");
  });

  it("rejects a missing or invalid VAT rate for a used category with INVALID_VAT_RATE", () => {
    // ZERO_RATED is used but not configured.
    expect(
      errorCode(() =>
        priceOrder(
          input({
            lines: [line({ vatCategory: "ZERO_RATED" })],
            // The runtime contract only requires rates for used categories.
            vatRatesBps: { STANDARD: 1500 } as unknown as Record<VatCategory, number>,
          }),
        ),
      ),
    ).toBe("INVALID_VAT_RATE");
    expect(
      errorCode(() =>
        priceOrder(input({ vatRatesBps: { STANDARD: 1500.5, ZERO_RATED: 0 } })),
      ),
    ).toBe("INVALID_VAT_RATE");
    expect(
      errorCode(() =>
        priceOrder(input({ vatRatesBps: { STANDARD: -1, ZERO_RATED: 0 } })),
      ),
    ).toBe("INVALID_VAT_RATE");
    expect(
      errorCode(() =>
        priceOrder(input({ vatRatesBps: { STANDARD: 10001, ZERO_RATED: 0 } })),
      ),
    ).toBe("INVALID_VAT_RATE");
  });

  it("ignores VAT rates for categories that no line uses", () => {
    // Only STANDARD lines, ZERO_RATED key absent: must not throw.
    const quote = priceOrder(
      input({
        lines: [line()],
        vatRatesBps: { STANDARD: 1500 } as unknown as Record<VatCategory, number>,
      }),
    );
    expect(quote.vatCents).toBe(450);
  });

  it("rejects duplicate speciesId lines with DUPLICATE_SPECIES", () => {
    expect(
      errorCode(() =>
        priceOrder(
          input({
            lines: [
              line({ speciesId: "pargo", grams: grams(1000) }),
              line({ speciesId: "pargo", grams: grams(2000) }),
            ],
          }),
        ),
      ),
    ).toBe("DUPLICATE_SPECIES");
  });

  it("rejects malformed line fields with INVALID_LINE", () => {
    expect(
      errorCode(() => priceOrder(input({ lines: [line({ grams: 7.5 as never })] }))),
    ).toBe("INVALID_LINE");
    expect(
      errorCode(() =>
        priceOrder(input({ lines: [line({ pricePerKgCents: -100 as never })] })),
      ),
    ).toBe("INVALID_LINE");
    expect(
      errorCode(() =>
        priceOrder(input({ lines: [line({ discountPolicy: "WHOLESALE" as never })] })),
      ),
    ).toBe("INVALID_LINE");
    expect(
      errorCode(() =>
        priceOrder(input({ lines: [line({ vatCategory: "LUXURY" as never })] })),
      ),
    ).toBe("INVALID_LINE");
    expect(
      errorCode(() => priceOrder(input({ lines: [line({ speciesId: "" })] }))),
    ).toBe("INVALID_LINE");
  });
});
