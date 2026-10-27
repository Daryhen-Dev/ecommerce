// Unit tests for the pure catalog mapping (no Prisma, no server-only, no
// clock access): every test uses concrete instants and plain row objects.

import { describe, it, expect } from "vitest";
import {
  buildCityCatalog,
  mapAirports,
  mapCatalogItems,
  selectNextShipment,
  type AirportRow,
  type CatalogItem,
  type LotRow,
  type SeasonRow,
  type ShipmentRow,
  type SpeciesRow,
  type TierRow,
} from "./catalog-mapping";

const AT = new Date("2025-10-15T17:00:00.000Z");
const HOUR = 3_600_000;
const DAY = 24 * HOUR;

let seq = 0;

function hoursBefore(instant: Date, hours: number): Date {
  return new Date(instant.getTime() - hours * HOUR);
}

function hoursAfter(instant: Date, hours: number): Date {
  return new Date(instant.getTime() + hours * HOUR);
}

/** Valid shipment window fields with cutoff at `cutoff` (departure +14h). */
function windowFields(cutoff: Date) {
  return {
    orderCutoffAt: cutoff,
    departsAt: new Date(cutoff.getTime() + 14 * HOUR),
    estimatedArrivalAt: new Date(cutoff.getTime() + 16 * HOUR),
    pickupStartsAt: new Date(cutoff.getTime() + 16 * HOUR),
    pickupEndsAt: new Date(cutoff.getTime() + 19 * HOUR),
  };
}

function shipment(overrides: Partial<ShipmentRow> = {}): ShipmentRow {
  seq += 1;
  return {
    id: `shipment-${seq}`,
    airportCode: "UIO",
    carrier: "Carga aérea",
    flightNumber: `FL-${seq}`,
    // Default window: cutoff 24h AFTER the reference instant, so the
    // shipment is orderable at AT unless a test overrides it.
    ...windowFields(hoursAfter(AT, 24)),
    status: "SCHEDULED",
    ...overrides,
  };
}

function season(overrides: Partial<SeasonRow> = {}): SeasonRow {
  return {
    speciesId: "species-tuna",
    startsAt: new Date(AT.getTime() - 30 * DAY),
    endsAt: new Date(AT.getTime() + 60 * DAY),
    ...overrides,
  };
}

function species(overrides: Partial<SpeciesRow> = {}): SpeciesRow {
  seq += 1;
  return {
    id: `species-${seq}`,
    slug: `species-${seq}`,
    name: `Especie ${seq}`,
    description: null,
    pricePerKgCents: 1000,
    discountPolicy: "GLOBAL",
    minOrderGrams: 1000,
    orderStepGrams: 500,
    isSeasonal: false,
    active: true,
    ...overrides,
  };
}

function lot(overrides: Partial<LotRow> = {}): LotRow {
  return {
    id: `lot-${seq++}`,
    speciesId: "species-1",
    totalGrams: 10_000,
    reservedGrams: 0,
    status: "OPEN",
    ...overrides,
  };
}

function tier(overrides: Partial<TierRow> = {}): TierRow {
  return {
    id: `tier-${seq++}`,
    speciesId: null,
    minTotalGrams: 5000,
    discountBps: 500,
    ...overrides,
  };
}

function itemBySlug(items: CatalogItem[], slug: string): CatalogItem {
  const item = items.find((i) => i.slug === slug);
  if (!item) throw new Error(`no catalog item with slug ${slug}`);
  return item;
}

describe("mapAirports", () => {
  it("keeps only active airports in UIO, GYE, CUE order, unknown codes appended alphabetically", () => {
    const rows: AirportRow[] = [
      { code: "CUE", city: "Cuenca", name: "Aeropuerto Mariscal Lamar", active: true },
      { code: "GYE", city: "Guayaquil", name: "Aeropuerto José Joaquín de Olmedo", active: true },
      { code: "LOJ", city: "Loja", name: "Aeropuerto Ciudad de Catamayo", active: false },
      { code: "XXX", city: "Otra", name: "Aeropuerto Otra", active: true },
      { code: "UIO", city: "Quito", name: "Aeropuerto Mariscal Sucre", active: true },
      { code: "AAA", city: "Primera", name: "Aeropuerto Primera", active: true },
    ];
    expect(mapAirports(rows).map((a) => a.code)).toEqual([
      "UIO",
      "GYE",
      "CUE",
      "AAA",
      "XXX",
    ]);
  });

  it("maps code, city and name into airport options", () => {
    const rows: AirportRow[] = [
      { code: "UIO", city: "Quito", name: "Aeropuerto Mariscal Sucre", active: true },
    ];
    expect(mapAirports(rows)).toEqual([
      { code: "UIO", city: "Quito", name: "Aeropuerto Mariscal Sucre" },
    ]);
  });
});

describe("selectNextShipment", () => {
  it("picks the shipment with the earliest orderable cutoff", () => {
    const later = shipment({ ...windowFields(hoursAfter(AT, 24)), flightNumber: "LATER" });
    const earlier = shipment({ ...windowFields(hoursAfter(AT, 2)), flightNumber: "EARLIER" });
    const warnings: string[] = [];
    expect(selectNextShipment([later, earlier], AT, warnings)?.flightNumber).toBe("EARLIER");
    expect(warnings).toEqual([]);
  });

  it("skips shipments whose cutoff already passed", () => {
    const past = shipment({ ...windowFields(hoursBefore(AT, 1)), flightNumber: "PAST" });
    const current = shipment({ ...windowFields(hoursAfter(AT, 2)), flightNumber: "CURRENT" });
    const warnings: string[] = [];
    expect(selectNextShipment([past, current], AT, warnings)?.flightNumber).toBe("CURRENT");
    expect(warnings).toEqual([]);
  });

  it("treats the cutoff instant as orderable (inclusive cutoff)", () => {
    const exact = shipment({ ...windowFields(AT), flightNumber: "EXACT", departsAt: hoursAfter(AT, 14) });
    const warnings: string[] = [];
    expect(selectNextShipment([exact], AT, warnings)?.flightNumber).toBe("EXACT");
    expect(warnings).toEqual([]);
  });

  it("skips non-SCHEDULED shipments even when their window is orderable", () => {
    const closed = shipment({
      ...windowFields(hoursAfter(AT, 24)),
      status: "CLOSED",
      flightNumber: "CLOSED",
    });
    const scheduled = shipment({ ...windowFields(hoursAfter(AT, 2)), flightNumber: "OK" });
    const warnings: string[] = [];
    expect(selectNextShipment([closed, scheduled], AT, warnings)?.flightNumber).toBe("OK");
  });

  it("skips a shipment with an invalid window and reports a warning instead of throwing", () => {
    const invalid = shipment({
      ...windowFields(hoursAfter(AT, 24)),
      pickupStartsAt: hoursAfter(AT, 20),
      pickupEndsAt: hoursAfter(AT, 19),
      flightNumber: "BROKEN",
    });
    const valid = shipment({ ...windowFields(hoursAfter(AT, 2)), flightNumber: "OK" });
    const warnings: string[] = [];
    expect(selectNextShipment([invalid, valid], AT, warnings)?.flightNumber).toBe("OK");
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain("BROKEN");
  });

  it("resolves a cutoff tie by the earliest departure", () => {
    const cutoff = hoursAfter(AT, 24);
    const lateDeparture = shipment({
      ...windowFields(cutoff),
      departsAt: hoursAfter(cutoff, 16),
      flightNumber: "LATE",
    });
    const earlyDeparture = shipment({
      ...windowFields(cutoff),
      departsAt: hoursAfter(cutoff, 14),
      flightNumber: "EARLY",
    });
    const warnings: string[] = [];
    expect(
      selectNextShipment([lateDeparture, earlyDeparture], AT, warnings)?.flightNumber,
    ).toBe("EARLY");
  });

  it("returns null when no shipment is orderable", () => {
    const warnings: string[] = [];
    expect(selectNextShipment([shipment({ ...windowFields(hoursBefore(AT, 1)) })], AT, warnings)).toBeNull();
    expect(selectNextShipment([], AT, warnings)).toBeNull();
    expect(warnings).toEqual([]);
  });
});

describe("mapCatalogItems availability", () => {
  function catalogOf(
    input: {
      species: SpeciesRow[];
      seasons?: SeasonRow[];
      lots?: LotRow[];
      tiers?: TierRow[];
    },
    at: Date = AT,
  ): { items: CatalogItem[]; warnings: string[] } {
    const warnings: string[] = [];
    const items = mapCatalogItems({
      species: input.species,
      seasons: input.seasons ?? [],
      lots: input.lots ?? [],
      tiers: input.tiers ?? [],
      at,
      warnings,
    });
    return { items, warnings };
  }

  it("sums availableGrams over OPEN lots only", () => {
    const sp = species({ id: "species-1", slug: "tuna" });
    const { items } = catalogOf({
      species: [sp],
      lots: [
        lot({ speciesId: "species-1", totalGrams: 30_000, reservedGrams: 5_000 }),
        lot({ speciesId: "species-1", totalGrams: 45_000 }),
      ],
    });
    expect(itemBySlug(items, "tuna").availability).toEqual({
      state: "AVAILABLE",
      availableGrams: 70_000,
    });
  });

  it("ignores CLOSED lots when summing availability", () => {
    const sp = species({ id: "species-1", slug: "tuna" });
    const { items } = catalogOf({
      species: [sp],
      lots: [
        lot({ speciesId: "species-1", totalGrams: 10_000, status: "OPEN" }),
        lot({ speciesId: "species-1", totalGrams: 100_000, status: "CLOSED" }),
      ],
    });
    expect(itemBySlug(items, "tuna").availability).toEqual({
      state: "AVAILABLE",
      availableGrams: 10_000,
    });
  });

  it("reports SOLD_OUT when the remainder is below the species minimum order", () => {
    const sp = species({ id: "species-1", slug: "tuna", minOrderGrams: 1000 });
    const { items } = catalogOf({
      species: [sp],
      lots: [
        lot({ speciesId: "species-1", totalGrams: 10_000, reservedGrams: 9_100 }),
      ],
    });
    expect(itemBySlug(items, "tuna").availability).toEqual({ state: "SOLD_OUT" });
  });

  it("reports SOLD_OUT when there are no OPEN lots at all", () => {
    const sp = species({ id: "species-1", slug: "tuna" });
    const { items } = catalogOf({
      species: [sp],
      lots: [lot({ speciesId: "species-1", status: "CLOSED" })],
    });
    expect(itemBySlug(items, "tuna").availability).toEqual({ state: "SOLD_OUT" });
  });

  it("reports OUT_OF_SEASON with the next season start for a seasonal species outside every window", () => {
    const nextStart = new Date(AT.getTime() + 40 * DAY);
    const sp = species({ id: "species-1", slug: "mahi", isSeasonal: true });
    const { items } = catalogOf({
      species: [sp],
      seasons: [
        season({
          speciesId: "species-1",
          startsAt: nextStart,
          endsAt: new Date(AT.getTime() + 120 * DAY),
        }),
      ],
      lots: [lot({ speciesId: "species-1", totalGrams: 40_000 })],
    });
    expect(itemBySlug(items, "mahi").availability).toEqual({
      state: "OUT_OF_SEASON",
      nextSeasonStart: nextStart,
    });
  });

  it("reports OUT_OF_SEASON with a null next season start when no future season exists", () => {
    const sp = species({ id: "species-1", slug: "mahi", isSeasonal: true });
    const { items } = catalogOf({
      species: [sp],
      seasons: [
        season({
          speciesId: "species-1",
          startsAt: new Date(AT.getTime() - 60 * DAY),
          endsAt: new Date(AT.getTime() - 30 * DAY),
        }),
      ],
    });
    expect(itemBySlug(items, "mahi").availability).toEqual({
      state: "OUT_OF_SEASON",
      nextSeasonStart: null,
    });
  });

  it("uses lots for a seasonal species that is in season at the instant", () => {
    const sp = species({ id: "species-1", slug: "lobster", isSeasonal: true });
    const { items } = catalogOf({
      species: [sp],
      seasons: [season({ speciesId: "species-1" })],
      lots: [
        lot({ speciesId: "species-1", totalGrams: 25_000 }),
        lot({ speciesId: "species-1", totalGrams: 5_000, reservedGrams: 5_000 }),
      ],
    });
    expect(itemBySlug(items, "lobster").availability).toEqual({
      state: "AVAILABLE",
      availableGrams: 25_000,
    });
  });

  it("skips a corrupted lot (LOT_STATE_INVALID) with a warning and counts the healthy ones", () => {
    const sp = species({ id: "species-1", slug: "tuna" });
    const corrupted = lot({
      speciesId: "species-1",
      totalGrams: 100,
      reservedGrams: 9_999,
    });
    const healthy = lot({ speciesId: "species-1", totalGrams: 25_000 });
    const { items, warnings } = catalogOf({
      species: [sp],
      lots: [corrupted, healthy],
    });
    expect(itemBySlug(items, "tuna").availability).toEqual({
      state: "AVAILABLE",
      availableGrams: 25_000,
    });
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain(corrupted.id);
  });

  it("excludes inactive species from the catalog", () => {
    const { items } = catalogOf({
      species: [
        species({ slug: "active-one" }),
        species({ slug: "inactive", active: false }),
      ],
    });
    expect(items.map((i) => i.slug)).toEqual(["active-one"]);
  });
});

describe("mapCatalogItems tiers", () => {
  function catalogOf(input: { species: SpeciesRow[]; tiers?: TierRow[] }): CatalogItem[] {
    return mapCatalogItems({
      species: input.species,
      seasons: [],
      lots: [lot({ speciesId: input.species[0].id, totalGrams: 20_000 })],
      tiers: input.tiers ?? [],
      at: AT,
      warnings: [],
    });
  }

  const globalTiers: TierRow[] = [
    tier({ id: "g1", speciesId: null, minTotalGrams: 10_000, discountBps: 1000 }),
    tier({ id: "g2", speciesId: null, minTotalGrams: 0, discountBps: 0 }),
    tier({ id: "g3", speciesId: null, minTotalGrams: 5_000, discountBps: 500 }),
  ];

  it("gives GLOBAL species the global tiers sorted ascending by minTotalGrams", () => {
    const sp = species({ id: "species-1", slug: "wahoo", discountPolicy: "GLOBAL" });
    const other = tier({ id: "x1", speciesId: "species-other", minTotalGrams: 1, discountBps: 9999 });
    const item = itemBySlug(catalogOf({ species: [sp], tiers: [...globalTiers, other] }), "wahoo");
    expect(item.tiers).toEqual([
      { minTotalGrams: 0, discountBps: 0 },
      { minTotalGrams: 5_000, discountBps: 500 },
      { minTotalGrams: 10_000, discountBps: 1000 },
    ]);
  });

  it("gives CUSTOM species its own tiers instead of the global ones, sorted ascending", () => {
    const sp = species({ id: "species-1", slug: "snapper", discountPolicy: "CUSTOM" });
    const own = [
      tier({ id: "c1", speciesId: "species-1", minTotalGrams: 8_000, discountBps: 800 }),
      tier({ id: "c2", speciesId: "species-1", minTotalGrams: 0, discountBps: 0 }),
      tier({ id: "c3", speciesId: "species-1", minTotalGrams: 3_000, discountBps: 300 }),
    ];
    const item = itemBySlug(catalogOf({ species: [sp], tiers: [...own, ...globalTiers] }), "snapper");
    expect(item.tiers).toEqual([
      { minTotalGrams: 0, discountBps: 0 },
      { minTotalGrams: 3_000, discountBps: 300 },
      { minTotalGrams: 8_000, discountBps: 800 },
    ]);
  });

  it("gives NONE species no tiers", () => {
    const sp = species({ id: "species-1", slug: "lobster", discountPolicy: "NONE" });
    const item = itemBySlug(catalogOf({ species: [sp], tiers: globalTiers }), "lobster");
    expect(item.tiers).toEqual([]);
  });

  it("maps the catalog item fields verbatim from the row", () => {
    const sp = species({
      id: "species-1",
      slug: "wahoo",
      name: "Wahoo (Guajo)",
      description: "Carne blanca y firme",
      pricePerKgCents: 900,
      minOrderGrams: 1000,
      orderStepGrams: 500,
    });
    const item = itemBySlug(catalogOf({ species: [sp] }), "wahoo");
    expect(item).toMatchObject({
      slug: "wahoo",
      name: "Wahoo (Guajo)",
      description: "Carne blanca y firme",
      pricePerKgCents: 900,
      minOrderGrams: 1000,
      orderStepGrams: 500,
      discountPolicy: "GLOBAL",
    });
  });
});

describe("mapCatalogItems species ordering", () => {
  it("orders species by name with the Spanish locale, accents included", () => {
    const { items } = mapCatalogItemsAndWarnings({
      species: [
        species({ slug: "dorado", name: "Dorado" }),
        species({ slug: "bacalao", name: "Bacalao de Galápagos" }),
        species({ slug: "angelito", name: "Ángelito" }),
        species({ slug: "atun", name: "Atún aleta amarilla" }),
      ],
      lots: [],
    });
    expect(items.map((i) => i.name)).toEqual([
      "Ángelito",
      "Atún aleta amarilla",
      "Bacalao de Galápagos",
      "Dorado",
    ]);
  });
});

// Small helper so the ordering test reads naturally; the core call is the same.
function mapCatalogItemsAndWarnings(input: {
  species: SpeciesRow[];
  seasons?: SeasonRow[];
  lots?: LotRow[];
  tiers?: TierRow[];
  at?: Date;
}): { items: CatalogItem[]; warnings: string[] } {
  const warnings: string[] = [];
  const items = mapCatalogItems({
    species: input.species,
    seasons: input.seasons ?? [],
    lots: input.lots ?? [],
    tiers: input.tiers ?? [],
    at: input.at ?? AT,
    warnings,
  });
  return { items, warnings };
}

describe("buildCityCatalog", () => {
  const airport: AirportRow = {
    code: "UIO",
    city: "Quito",
    name: "Aeropuerto Mariscal Sucre",
    active: true,
  };

  it("assembles airport, next shipment, items and warnings", () => {
    const sp = species({ id: "species-1", slug: "wahoo" });
    const catalog = buildCityCatalog({
      airport,
      shipments: [shipment({ flightNumber: "DEMO-UIO-1" })],
      species: [sp],
      seasons: [],
      lots: [lot({ speciesId: "species-1", totalGrams: 90_000, reservedGrams: 30_000 })],
      tiers: [],
      at: AT,
    });
    expect(catalog.airport).toEqual({ code: "UIO", city: "Quito", name: "Aeropuerto Mariscal Sucre" });
    expect(catalog.shipment?.flightNumber).toBe("DEMO-UIO-1");
    expect(catalog.items).toHaveLength(1);
    expect(catalog.warnings).toEqual([]);
  });

  it("still returns items when no shipment is orderable (page shows 'sin vuelo disponible')", () => {
    const sp = species({ id: "species-1", slug: "wahoo" });
    const catalog = buildCityCatalog({
      airport,
      shipments: [shipment({ ...windowFields(hoursBefore(AT, 1)) })],
      species: [sp],
      seasons: [],
      lots: [lot({ speciesId: "species-1", totalGrams: 90_000 })],
      tiers: [],
      at: AT,
    });
    expect(catalog.shipment).toBeNull();
    expect(catalog.items).toHaveLength(1);
    expect(itemBySlug(catalog.items, "wahoo").availability).toEqual({
      state: "AVAILABLE",
      availableGrams: 90_000,
    });
  });

  it("collects shipment and lot warnings in the catalog", () => {
    const sp = species({ id: "species-1", slug: "wahoo" });
    const catalog = buildCityCatalog({
      airport,
      shipments: [
        shipment({
          ...windowFields(hoursAfter(AT, 24)),
          pickupStartsAt: hoursAfter(AT, 20),
          pickupEndsAt: hoursAfter(AT, 19),
          flightNumber: "BROKEN",
        }),
      ],
      species: [sp],
      seasons: [],
      lots: [lot({ speciesId: "species-1", totalGrams: 10, reservedGrams: 50 })],
      tiers: [],
      at: AT,
    });
    expect(catalog.shipment).toBeNull();
    expect(catalog.warnings).toHaveLength(2);
  });
});

describe("mapping purity", () => {
  it("never mutates its inputs", () => {
    const airportRows: AirportRow[] = [
      { code: "CUE", city: "Cuenca", name: "C", active: true },
      { code: "UIO", city: "Quito", name: "Q", active: true },
    ];
    const shipmentRows: ShipmentRow[] = [
      shipment({ ...windowFields(hoursAfter(AT, 48)), flightNumber: "A" }),
      shipment({ ...windowFields(hoursAfter(AT, 24)), flightNumber: "B" }),
    ];
    const speciesRows: SpeciesRow[] = [
      species({ id: "species-1", slug: "dorado", name: "Dorado" }),
      species({ id: "species-2", slug: "atun", name: "Atún" }),
    ];
    const seasonRows: SeasonRow[] = [season({ speciesId: "species-2" })];
    const lotRows: LotRow[] = [lot({ speciesId: "species-1", totalGrams: 5_000 })];
    const tierRows: TierRow[] = [
      tier({ id: "t1", speciesId: null, minTotalGrams: 10_000, discountBps: 1000 }),
      tier({ id: "t2", speciesId: null, minTotalGrams: 0, discountBps: 0 }),
    ];
    const before = JSON.stringify({
      airportRows,
      shipmentRows,
      speciesRows,
      seasonRows,
      lotRows,
      tierRows,
    });

    mapAirports(airportRows);
    selectNextShipment(shipmentRows, AT, []);
    mapCatalogItems({
      species: speciesRows,
      seasons: seasonRows,
      lots: lotRows,
      tiers: tierRows,
      at: AT,
      warnings: [],
    });
    buildCityCatalog({
      airport: airportRows[1],
      shipments: shipmentRows,
      species: speciesRows,
      seasons: seasonRows,
      lots: lotRows,
      tiers: tierRows,
      at: AT,
    });

    expect(JSON.stringify({ airportRows, shipmentRows, speciesRows, seasonRows, lotRows, tierRows })).toBe(before);
  });
});
