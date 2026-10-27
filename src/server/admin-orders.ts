// Order (pedido) persistence for the admin panel. Thin data access only:
// Prisma queries plus the guarded status update. No parsing, no messages, no
// rules here — those live in the pure `@/lib/admin-orders`.
//
// One invariant is enforced by construction instead of by trust: a status
// change matches the status the page showed (`updateMany` on
// `{ id, status: expected }`), so a stale page can never flip an order twice
// and a tampered request can never cancel an order that is already paid.

import "server-only";

import { db } from "@/lib/db";
import type { OrderStatus } from "@/lib/admin-orders";
import type { ShipmentStatus } from "@/generated/prisma/enums";

/** List page size for the per-shipment order list (no pagination framework). */
export const ORDER_LIST_LIMIT = 50;

/** One shipment the operator can pick in the selector. */
export interface AdminShipmentOption {
  id: string;
  flightNumber: string | null;
  airportCode: string;
  airportCity: string;
  departsAt: Date;
  status: ShipmentStatus;
  orderCount: number;
}

/** One order line as the panel renders it: the values locked at order time. */
export interface AdminOrderItemRow {
  id: string;
  speciesName: string;
  speciesSlug: string;
  grams: number;
  pricePerKgCents: number;
  discountBps: number;
  vatRateBps: number;
  grossCents: number;
  discountCents: number;
  vatCents: number;
  lineTotalCents: number;
}

/** One order of the selected shipment, with its locked lines and totals. */
export interface AdminOrderRow {
  id: string;
  code: string;
  status: OrderStatus;
  customerName: string;
  customerEmail: string;
  customerPhone: string;
  customerIdNumber: string;
  totalGrams: number;
  subtotalCents: number;
  discountCents: number;
  vatCents: number;
  totalCents: number;
  paidAt: Date | null;
  createdAt: Date;
  items: AdminOrderItemRow[];
}

/**
 * Every shipment, newest departure first, with the number of orders it carries.
 * The selector shows all of them (a flight with no orders is a legitimate
 * answer to "what sold on this flight?"), and the order count lets the page
 * default to a flight that has something to show.
 */
export async function listShipmentsForOrderSelector(): Promise<
  AdminShipmentOption[]
> {
  const rows = await db.shipment.findMany({
    select: {
      id: true,
      flightNumber: true,
      departsAt: true,
      status: true,
      airport: { select: { code: true, city: true } },
      _count: { select: { orders: true } },
    },
    orderBy: [{ departsAt: "desc" }, { createdAt: "desc" }],
  });

  return rows.map((row) => ({
    id: row.id,
    flightNumber: row.flightNumber,
    airportCode: row.airport.code,
    airportCity: row.airport.city,
    departsAt: row.departsAt,
    status: row.status,
    orderCount: row._count.orders,
  }));
}

/**
 * Orders of one shipment, newest first, with their locked lines and totals.
 * Nothing is recomputed: the totals shown are the ones stored on the order and
 * its items, because a later price or tax change must never re-price history.
 */
export async function listOrdersForShipment(
  shipmentId: string,
): Promise<AdminOrderRow[]> {
  const rows = await db.order.findMany({
    where: { shipmentId },
    select: {
      id: true,
      code: true,
      status: true,
      customerName: true,
      customerEmail: true,
      customerPhone: true,
      customerIdNumber: true,
      totalGrams: true,
      subtotalCents: true,
      discountCents: true,
      vatCents: true,
      totalCents: true,
      paidAt: true,
      createdAt: true,
      items: {
        select: {
          id: true,
          grams: true,
          pricePerKgCents: true,
          discountBps: true,
          vatRateBps: true,
          grossCents: true,
          discountCents: true,
          vatCents: true,
          lineTotalCents: true,
          species: { select: { name: true, slug: true } },
        },
        orderBy: { id: "asc" },
      },
    },
    orderBy: [{ createdAt: "desc" }, { code: "asc" }],
    take: ORDER_LIST_LIMIT,
  });

  return rows.map((row) => ({
    id: row.id,
    code: row.code,
    status: row.status,
    customerName: row.customerName,
    customerEmail: row.customerEmail,
    customerPhone: row.customerPhone,
    customerIdNumber: row.customerIdNumber,
    totalGrams: row.totalGrams,
    subtotalCents: row.subtotalCents,
    discountCents: row.discountCents,
    vatCents: row.vatCents,
    totalCents: row.totalCents,
    paidAt: row.paidAt,
    createdAt: row.createdAt,
    items: row.items.map((item) => ({
      id: item.id,
      speciesName: item.species.name,
      speciesSlug: item.species.slug,
      grams: item.grams,
      pricePerKgCents: item.pricePerKgCents,
      discountBps: item.discountBps,
      vatRateBps: item.vatRateBps,
      grossCents: item.grossCents,
      discountCents: item.discountCents,
      vatCents: item.vatCents,
      lineTotalCents: item.lineTotalCents,
    })),
  }));
}

/**
 * Applies one status change, but only to the row that is still in the status
 * the operator saw. Returns false when no row matched (the order vanished or
 * somebody already changed it), so the action reports a stale page instead of
 * pretending the click worked.
 *
 * `paidAt` is written as given, including null: only the pure
 * `paidAtForTransition` decides what a status means for the payment instant.
 */
export async function applyOrderStatusChange(input: {
  id: string;
  expected: OrderStatus;
  next: OrderStatus;
  paidAt: Date | null;
}): Promise<boolean> {
  const result = await db.order.updateMany({
    where: { id: input.id, status: input.expected },
    data: { status: input.next, paidAt: input.paidAt },
  });
  return result.count === 1;
}
