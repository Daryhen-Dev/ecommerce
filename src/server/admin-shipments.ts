// Shipment (vuelo) persistence for the admin panel. Thin data access only:
// Prisma queries plus the pure logic from `@/lib/admin-shipments`.
//
// Closing uses an `updateMany` scoped to SCHEDULED rows, so it is idempotent
// and it mirrors the storefront rule: a closed flight stops accepting orders
// immediately because the catalog only reads SCHEDULED shipments.

import "server-only";

import { db } from "@/lib/db";
import type { ShipmentInsert } from "@/lib/admin-shipments";

/** List page size for the admin flight list (no pagination framework). */
export const SHIPMENT_LIST_LIMIT = 50;

/** Fixed storefront order of the mainland destination airports. */
const AIRPORT_ORDER: readonly string[] = ["UIO", "GYE", "CUE"];

export type ShipmentStatusLabel =
  | "SCHEDULED"
  | "CLOSED"
  | "IN_TRANSIT"
  | "ARRIVED"
  | "COMPLETED";

/** One row of the admin flight list. */
export interface AdminShipmentRow {
  id: string;
  airportCode: string;
  airportCity: string;
  flightNumber: string | null;
  carrier: string | null;
  orderCutoffAt: Date;
  departsAt: Date;
  estimatedArrivalAt: Date;
  pickupStartsAt: Date;
  pickupEndsAt: Date;
  status: ShipmentStatusLabel;
}

/** An active airport the operator can schedule a flight to. */
export interface AirportIdOption {
  id: string;
  code: string;
  city: string;
  name: string;
}

function airportRank(code: string): number {
  const index = AIRPORT_ORDER.indexOf(code);
  return index === -1 ? AIRPORT_ORDER.length : index;
}

/** Active airports in UIO, GYE, CUE order, with their ids for the select. */
export async function listAirportIdOptions(): Promise<AirportIdOption[]> {
  const rows = await db.airport.findMany({
    where: { active: true },
    select: { id: true, code: true, city: true, name: true },
  });
  return rows.sort(
    (a, b) => airportRank(a.code) - airportRank(b.code) || a.code.localeCompare(b.code),
  );
}

/**
 * Flights grouped-ready: ordered by airport (UIO, GYE, CUE, then the rest)
 * and inside each airport by cutoff, so the list reads like the operation
 * day. Capped at `SHIPMENT_LIST_LIMIT`.
 */
export async function listShipmentsForAdmin(): Promise<AdminShipmentRow[]> {
  const rows = await db.shipment.findMany({
    where: { airport: { is: { active: true } } },
    select: {
      id: true,
      flightNumber: true,
      carrier: true,
      orderCutoffAt: true,
      departsAt: true,
      estimatedArrivalAt: true,
      pickupStartsAt: true,
      pickupEndsAt: true,
      status: true,
      airport: { select: { code: true, city: true } },
    },
    orderBy: { orderCutoffAt: "asc" },
    take: SHIPMENT_LIST_LIMIT,
  });

  return rows
    .map((row) => ({
      id: row.id,
      airportCode: row.airport.code,
      airportCity: row.airport.city,
      flightNumber: row.flightNumber,
      carrier: row.carrier,
      orderCutoffAt: row.orderCutoffAt,
      departsAt: row.departsAt,
      estimatedArrivalAt: row.estimatedArrivalAt,
      pickupStartsAt: row.pickupStartsAt,
      pickupEndsAt: row.pickupEndsAt,
      status: row.status,
    }))
    .sort(
      (a, b) =>
        airportRank(a.airportCode) - airportRank(b.airportCode) ||
        a.airportCode.localeCompare(b.airportCode) ||
        a.orderCutoffAt.getTime() - b.orderCutoffAt.getTime(),
    );
}

/** Inserts one flight exactly as the pure mapping built it. */
export async function createShipmentRecord(insert: ShipmentInsert): Promise<void> {
  await db.shipment.create({ data: insert });
}

/**
 * Closes one SCHEDULED flight. Returns false when the row was missing or was
 * not SCHEDULED, so the action can report a stale page instead of silently
 * changing an in-transit or completed flight.
 */
export async function closeShipmentById(id: string): Promise<boolean> {
  const result = await db.shipment.updateMany({
    where: { id, status: "SCHEDULED" },
    data: { status: "CLOSED" },
  });
  return result.count === 1;
}
