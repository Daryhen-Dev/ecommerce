// Catalog read service for the storefront pages. Thin data access only:
// Prisma queries with selected columns, then the pure mapping in
// ./catalog-mapping applies every rule. The request instant is taken ONCE
// per exported function and passed down, so all rules see the same clock
// reading.

import "server-only";

import { canOrder, ShipmentError, type ShipmentWindow } from "../domain/shipment";

import { db } from "@/lib/db";

import {
  buildCityCatalog,
  mapAirports,
  type AirportOption,
  type AirportRow,
  type CityCatalog,
  type ShipmentRow,
  type SpeciesRow,
} from "./catalog-mapping";

export type {
  AirportOption,
  CatalogItem,
  CityCatalog,
  ShipmentSummary,
  SpeciesAvailability,
} from "./catalog-mapping";

const DAY_MS = 24 * 60 * 60 * 1000;

export async function listAirports(): Promise<AirportOption[]> {
  const rows: AirportRow[] = await db.airport.findMany({
    select: { code: true, city: true, name: true, active: true },
  });
  return mapAirports(rows);
}

export async function getCityCatalog(
  airportCode: string,
  /** Request instant; defaults to now. Callers that need ONE instant across
   * several rules (e.g. the cart quote: orderability + VAT rates) pass it. */
  at: Date = new Date(),
): Promise<CityCatalog | null> {
  const code = airportCode.toUpperCase();
  if (!/^[A-Z]{3}$/.test(code)) {
    return null;
  }

  const airport = await db.airport.findUnique({
    where: { code },
    select: { id: true, code: true, city: true, name: true, active: true },
  });
  // Unknown or inactive airport: the page renders a 404.
  if (!airport || !airport.active) {
    return null;
  }

  // One bounded query per entity type (no N+1). The cutoff floor keeps old
  // shipments out of the result set; the mapping still re-checks
  // orderability per row. All discount tiers are read in the same batch:
  // the mapping picks the global ones (speciesId null) and each species's
  // own by id, and the tier table is small.
  const [shipments, speciesWithSeasons, lots, tiers] = await Promise.all([
    db.shipment.findMany({
      where: {
        airportId: airport.id,
        status: "SCHEDULED",
        orderCutoffAt: { gte: new Date(at.getTime() - DAY_MS) },
      },
      select: {
        id: true,
        carrier: true,
        flightNumber: true,
        orderCutoffAt: true,
        departsAt: true,
        estimatedArrivalAt: true,
        pickupStartsAt: true,
        pickupEndsAt: true,
        status: true,
        airport: { select: { code: true } },
      },
      orderBy: { orderCutoffAt: "asc" },
    }),
    db.species.findMany({
      where: { active: true },
      select: {
        id: true,
        slug: true,
        name: true,
        description: true,
        pricePerKgCents: true,
        discountPolicy: true,
        vatCategory: true,
        minOrderGrams: true,
        orderStepGrams: true,
        isSeasonal: true,
        active: true,
        seasons: { select: { speciesId: true, startsAt: true, endsAt: true } },
      },
    }),
    db.lot.findMany({
      where: { status: "OPEN" },
      select: {
        id: true,
        speciesId: true,
        totalGrams: true,
        reservedGrams: true,
        status: true,
      },
    }),
    db.discountTier.findMany({
      select: {
        id: true,
        speciesId: true,
        minTotalGrams: true,
        discountBps: true,
      },
      orderBy: { minTotalGrams: "asc" },
    }),
  ]);

  // Flatten the nested season rows into the plain row shapes the mapping expects.
  const shipmentRows: ShipmentRow[] = shipments.map((row) => ({
    id: row.id,
    airportCode: row.airport.code,
    carrier: row.carrier,
    flightNumber: row.flightNumber,
    orderCutoffAt: row.orderCutoffAt,
    departsAt: row.departsAt,
    estimatedArrivalAt: row.estimatedArrivalAt,
    pickupStartsAt: row.pickupStartsAt,
    pickupEndsAt: row.pickupEndsAt,
    status: row.status,
  }));
  const seasonRows = speciesWithSeasons.flatMap((s) => s.seasons);
  const speciesRows: SpeciesRow[] = speciesWithSeasons.map((s) => ({
    id: s.id,
    slug: s.slug,
    name: s.name,
    description: s.description,
    pricePerKgCents: s.pricePerKgCents,
    discountPolicy: s.discountPolicy,
    vatCategory: s.vatCategory,
    minOrderGrams: s.minOrderGrams,
    orderStepGrams: s.orderStepGrams,
    isSeasonal: s.isSeasonal,
    active: s.active,
  }));

  return buildCityCatalog({
    airport: airport,
    shipments: shipmentRows,
    species: speciesRows,
    seasons: seasonRows,
    lots: lots,
    tiers: tiers,
    at,
  });
}

/**
 * Current orderable shipment ids of every OTHER active airport. Used by the
 * cart page to tell a stale cart (its shipment is no longer orderable
 * anywhere) apart from another city's live cart, which must stay untouched
 * so switching cities keeps showing each city's own cart.
 */
export async function listOtherCurrentShipmentIds(
  airportCode: string,
): Promise<string[]> {
  const code = airportCode.toUpperCase();
  if (!/^[A-Z]{3}$/.test(code)) {
    return [];
  }
  const at = new Date();

  // Earliest-cutoff order: the first orderable shipment per airport is its
  // current one. Same cutoff floor as getCityCatalog keeps the query bounded.
  const shipments = await db.shipment.findMany({
    where: {
      status: "SCHEDULED",
      orderCutoffAt: { gte: new Date(at.getTime() - DAY_MS) },
      airport: { is: { active: true, code: { not: code } } },
    },
    select: {
      id: true,
      airportId: true,
      orderCutoffAt: true,
      departsAt: true,
      estimatedArrivalAt: true,
      pickupStartsAt: true,
      pickupEndsAt: true,
      status: true,
    },
    orderBy: { orderCutoffAt: "asc" },
  });

  const currentByAirport = new Map<string, string>();
  for (const row of shipments) {
    if (currentByAirport.has(row.airportId)) continue;
    const window: ShipmentWindow = {
      orderCutoffAt: row.orderCutoffAt,
      departsAt: row.departsAt,
      estimatedArrivalAt: row.estimatedArrivalAt,
      pickupStartsAt: row.pickupStartsAt,
      pickupEndsAt: row.pickupEndsAt,
    };
    try {
      if (!canOrder(window, at)) continue;
    } catch (error) {
      if (error instanceof ShipmentError && error.code === "INVALID_SHIPMENT_WINDOW") {
        continue;
      }
      throw error;
    }
    currentByAirport.set(row.airportId, row.id);
  }
  return [...currentByAirport.values()];
}
