import { describe, it, expect } from "vitest";
import * as domain from "@/domain";

describe("domain module", () => {
  it("loads without importing any framework or database module", () => {
    expect(domain).toBeDefined();
  });

  it("re-exports the money, weight, pricing, tax, season and shipment public API", () => {
    expect(typeof domain.cents).toBe("function");
    expect(typeof domain.isCents).toBe("function");
    expect(typeof domain.percentOf).toBe("function");
    expect(typeof domain.formatUsd).toBe("function");
    expect(typeof domain.grams).toBe("function");
    expect(typeof domain.isGrams).toBe("function");
    expect(typeof domain.parseKilograms).toBe("function");
    expect(typeof domain.formatKilograms).toBe("function");
    expect(typeof domain.priceOrder).toBe("function");
    expect(domain.PricingError).toBeInstanceOf(Function);
    expect(typeof domain.resolveVatRates).toBe("function");
    expect(domain.TaxError).toBeInstanceOf(Function);
    expect(typeof domain.isSpeciesAvailable).toBe("function");
    expect(typeof domain.findCurrentSeason).toBe("function");
    expect(typeof domain.nextSeasonStart).toBe("function");
    expect(domain.SeasonError).toBeInstanceOf(Function);
    expect(typeof domain.canOrder).toBe("function");
    expect(typeof domain.shipmentPhase).toBe("function");
    expect(typeof domain.parseShipmentWindow).toBe("function");
    expect(domain.ShipmentError).toBeInstanceOf(Function);
    expect(typeof domain.canReserve).toBe("function");
    expect(typeof domain.reserve).toBe("function");
    expect(typeof domain.release).toBe("function");
    expect(typeof domain.closeLot).toBe("function");
    expect(typeof domain.availableGrams).toBe("function");
    expect(typeof domain.canFulfillOrder).toBe("function");
    expect(domain.LotError).toBeInstanceOf(Function);
  });

  it("prices a small order end to end through the barrel", () => {
    const quote = domain.priceOrder({
      lines: [
        {
          speciesId: "pargo",
          grams: domain.grams(3000),
          pricePerKgCents: domain.cents(1000),
          discountPolicy: "GLOBAL",
          vatCategory: "STANDARD",
        },
      ],
      globalTiers: [{ minTotalGrams: 0, discountBps: 0 }],
      vatRatesBps: { STANDARD: 1500, ZERO_RATED: 0 },
    });
    expect(quote.totalCents).toBe(3450);
    expect(domain.formatUsd(quote.totalCents)).toBe("$34.50");
    expect(domain.formatKilograms(quote.lines[0].grams)).toBe("3 kg");
  });
});
