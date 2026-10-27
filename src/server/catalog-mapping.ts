// Pure catalog mapping: turns plain database-shaped rows plus one instant
// into the storefront view models, applying the domain rules (orderable
// shipments, seasonal availability, OPEN-lot stock, discount tiers).
//
// No Prisma, no `server-only`, no clock access: rows are plain interfaces
// defined here, the instant is a parameter, and inputs are never mutated.
// Row-shaped data that violates domain invariants (corrupted lots, invalid
// shipment windows) is skipped and collected as warnings, never thrown at
// the page.

import {
  canOrder,
  ShipmentError,
  type ShipmentWindow,
} from "../domain/shipment";
import { availableGrams, LotError } from "../domain/lot";
import { isSpeciesAvailable, nextSeasonStart } from "../domain/season";

// --- row shapes (selected columns of the Prisma models; no Prisma import) ---

export interface AirportRow {
  code: string;
  city: string;
  name: string;
  active: boolean;
}

export interface ShipmentRow extends ShipmentWindow {
  id: string;
  airportCode: string;
  carrier: string | null;
  flightNumber: string | null;
  status: string;
}

export interface SeasonRow {
  speciesId: string;
  startsAt: Date;
  endsAt: Date;
}

export interface SpeciesRow {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  pricePerKgCents: number;
  discountPolicy: "GLOBAL" | "CUSTOM" | "NONE";
  minOrderGrams: number;
  orderStepGrams: number;
  isSeasonal: boolean;
  active: boolean;
}

export interface LotRow {
  id: string;
  speciesId: string;
  totalGrams: number;
  reservedGrams: number;
  status: "OPEN" | "CLOSED";
}

export interface TierRow {
  id: string;
  speciesId: string | null;
  minTotalGrams: number;
  discountBps: number;
}

// --- view models ---

export interface AirportOption {
  code: string;
  city: string;
  name: string;
}

export interface ShipmentSummary {
  id: string;
  airportCode: string;
  flightNumber: string | null;
  carrier: string | null;
  orderCutoffAt: Date;
  departsAt: Date;
  estimatedArrivalAt: Date;
  pickupStartsAt: Date;
  pickupEndsAt: Date;
}

export type SpeciesAvailability =
  | { state: "AVAILABLE"; availableGrams: number }
  | { state: "SOLD_OUT" }
  | { state: "OUT_OF_SEASON"; nextSeasonStart: Date | null };

export interface CatalogItem {
  slug: string;
  name: string;
  description: string | null;
  pricePerKgCents: number;
  minOrderGrams: number;
  orderStepGrams: number;
  discountPolicy: "GLOBAL" | "CUSTOM" | "NONE";
  /** Effective tiers for this species: global for GLOBAL, its own for CUSTOM, [] for NONE. */
  tiers: { minTotalGrams: number; discountBps: number }[];
  availability: SpeciesAvailability;
}

export interface CityCatalog {
  airport: AirportOption;
  shipment: ShipmentSummary | null;
  items: CatalogItem[];
  /** Rows skipped because their data violated domain invariants, for server logging. */
  warnings: string[];
}

// --- mapping functions ---

/** Fixed storefront order for the mainland destination cities. */
const AIRPORT_ORDER: readonly string[] = ["UIO", "GYE", "CUE"];

function airportRank(code: string): number {
  const index = AIRPORT_ORDER.indexOf(code);
  return index === -1 ? AIRPORT_ORDER.length : index;
}

/**
 * Active airports in UIO, GYE, CUE order; unknown codes appended
 * alphabetically after them.
 */
export function mapAirports(rows: AirportRow[]): AirportOption[] {
  return rows
    .filter((row) => row.active)
    .map((row) => ({ code: row.code, city: row.city, name: row.name }))
    .sort(
      (a, b) =>
        airportRank(a.code) - airportRank(b.code) ||
        a.code.localeCompare(b.code),
    );
}

function toShipmentSummary(row: ShipmentRow): ShipmentSummary {
  return {
    id: row.id,
    airportCode: row.airportCode,
    flightNumber: row.flightNumber,
    carrier: row.carrier,
    orderCutoffAt: row.orderCutoffAt,
    departsAt: row.departsAt,
    estimatedArrivalAt: row.estimatedArrivalAt,
    pickupStartsAt: row.pickupStartsAt,
    pickupEndsAt: row.pickupEndsAt,
  };
}

/**
 * The next orderable shipment: SCHEDULED status AND `canOrder` at `at`,
 * earliest `orderCutoffAt` (tie: earliest `departsAt`). Shipments whose
 * window fails `parseShipmentWindow` are skipped with a warning instead of
 * throwing. Returns null when none is orderable.
 */
export function selectNextShipment(
  rows: ShipmentRow[],
  at: Date,
  warnings: string[],
): ShipmentSummary | null {
  const orderable: ShipmentRow[] = [];
  for (const row of rows) {
    if (row.status !== "SCHEDULED") continue;
    try {
      if (canOrder(row, at)) {
        orderable.push(row);
      }
    } catch (error) {
      if (error instanceof ShipmentError && error.code === "INVALID_SHIPMENT_WINDOW") {
        warnings.push(
          `shipment ${row.id} (flight ${row.flightNumber ?? "unknown"}): invalid window, skipped (${error.message})`,
        );
        continue;
      }
      throw error;
    }
  }
  if (orderable.length === 0) {
    return null;
  }
  orderable.sort(
    (a, b) =>
      a.orderCutoffAt.getTime() - b.orderCutoffAt.getTime() ||
      a.departsAt.getTime() - b.departsAt.getTime(),
  );
  return toShipmentSummary(orderable[0]);
}

function sortedTiersFor(
  policy: "GLOBAL" | "CUSTOM" | "NONE",
  speciesId: string,
  allTiers: TierRow[],
): { minTotalGrams: number; discountBps: number }[] {
  if (policy === "NONE") {
    return [];
  }
  const selected =
    policy === "GLOBAL"
      ? allTiers.filter((t) => t.speciesId === null)
      : allTiers.filter((t) => t.speciesId === speciesId);
  return selected
    .map((t) => ({ minTotalGrams: t.minTotalGrams, discountBps: t.discountBps }))
    .sort((a, b) => a.minTotalGrams - b.minTotalGrams);
}

function availabilityOf(
  species: SpeciesRow,
  seasons: SeasonRow[],
  openLots: LotRow[],
  at: Date,
  warnings: string[],
): SpeciesAvailability {
  if (species.isSeasonal && !isSpeciesAvailable({ isSeasonal: true, seasons }, at)) {
    return {
      state: "OUT_OF_SEASON",
      nextSeasonStart: nextSeasonStart(seasons, at),
    };
  }
  let total = 0;
  for (const lot of openLots) {
    try {
      total += availableGrams(lot);
    } catch (error) {
      if (error instanceof LotError && error.code === "LOT_STATE_INVALID") {
        warnings.push(`lot ${lot.id}: corrupted state, skipped (${error.message})`);
        continue;
      }
      throw error;
    }
  }
  // A remainder smaller than the species minimum cannot be ordered.
  if (total < species.minOrderGrams) {
    return { state: "SOLD_OUT" };
  }
  return { state: "AVAILABLE", availableGrams: total };
}

/**
 * Active species sorted by Spanish-collated name, each with its effective
 * tiers and availability computed from the OPEN lots and season windows.
 * Availability does not depend on the shipment (shared lot stock).
 */
export function mapCatalogItems(input: {
  species: SpeciesRow[];
  seasons: SeasonRow[];
  lots: LotRow[];
  tiers: TierRow[];
  at: Date;
  warnings: string[];
}): CatalogItem[] {
  const { species, seasons, lots, tiers, at, warnings } = input;

  const seasonsBySpecies = new Map<string, SeasonRow[]>();
  for (const season of seasons) {
    const list = seasonsBySpecies.get(season.speciesId) ?? [];
    list.push(season);
    seasonsBySpecies.set(season.speciesId, list);
  }

  const openLotsBySpecies = new Map<string, LotRow[]>();
  for (const lot of lots) {
    if (lot.status !== "OPEN") continue;
    const list = openLotsBySpecies.get(lot.speciesId) ?? [];
    list.push(lot);
    openLotsBySpecies.set(lot.speciesId, list);
  }

  return species
    .filter((s) => s.active)
    .slice()
    .sort((a, b) => a.name.localeCompare(b.name, "es"))
    .map((s) => ({
      slug: s.slug,
      name: s.name,
      description: s.description,
      pricePerKgCents: s.pricePerKgCents,
      minOrderGrams: s.minOrderGrams,
      orderStepGrams: s.orderStepGrams,
      discountPolicy: s.discountPolicy,
      tiers: sortedTiersFor(s.discountPolicy, s.id, tiers),
      availability: availabilityOf(
        s,
        seasonsBySpecies.get(s.id) ?? [],
        openLotsBySpecies.get(s.id) ?? [],
        at,
        warnings,
      ),
    }));
}

/**
 * Full city catalog: airport option, next orderable shipment (or null) and
 * the species items. Stock is shared across shipments, so items and their
 * availability do not change with the selected shipment. Warnings from
 * skipped rows are collected on the catalog for server logging.
 */
export function buildCityCatalog(input: {
  airport: AirportRow;
  shipments: ShipmentRow[];
  species: SpeciesRow[];
  seasons: SeasonRow[];
  lots: LotRow[];
  tiers: TierRow[];
  at: Date;
}): CityCatalog {
  const warnings: string[] = [];
  const shipment = selectNextShipment(input.shipments, input.at, warnings);
  const items = mapCatalogItems({
    species: input.species,
    seasons: input.seasons,
    lots: input.lots,
    tiers: input.tiers,
    at: input.at,
    warnings,
  });
  return {
    airport: {
      code: input.airport.code,
      city: input.airport.city,
      name: input.airport.name,
    },
    shipment,
    items,
    warnings,
  };
}
