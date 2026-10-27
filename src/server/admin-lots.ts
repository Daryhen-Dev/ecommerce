// Lot (desembarque) persistence for the admin panel. Thin data access only:
// Prisma queries plus the pure logic from `@/lib/admin-lots`. No parsing, no
// messages, no rules here.
//
// Two invariants are enforced by construction instead of by trust:
// - `closeLotById` updates only rows that are still OPEN, so a double click
//   cannot flip anything and `reservedGrams` is never part of the payload.
// - `openLotsNearLandedAt` narrows the duplicate check to the same species
//   and a one-day window; the exact Ecuador-day comparison stays in the pure
//   `canCreateLot`.

import "server-only";

import { db } from "@/lib/db";
import type { LotInsert } from "@/lib/admin-lots";
import { availableGrams, type LotStatus } from "@/domain/lot";

/** List page size for the admin landing list (no pagination framework). */
export const LOT_LIST_LIMIT = 50;

/** Window used to fetch candidate duplicates around a landing instant. */
const DUPLICATE_WINDOW_MS = 24 * 60 * 60 * 1000;

/** One species the operator can pick when registering a landing. */
export interface SpeciesOption {
  id: string;
  slug: string;
  name: string;
}

/** One row of the admin landing list, with derived availability. */
export interface AdminLotRow {
  id: string;
  speciesName: string;
  speciesSlug: string;
  landedAt: Date;
  totalGrams: number;
  reservedGrams: number;
  availableGrams: number;
  status: LotStatus;
  notes: string | null;
}

/** Active species, Spanish-collated by name, for the form select and labels. */
export async function listSpeciesOptions(): Promise<SpeciesOption[]> {
  const rows = await db.species.findMany({
    where: { active: true },
    select: { id: true, slug: true, name: true },
  });
  return rows.sort((a, b) => a.name.localeCompare(b.name, "es"));
}

/**
 * Newest landings first, optionally filtered by species slug, capped at
 * `LOT_LIST_LIMIT`. The derived availability goes through the domain helper,
 * so the panel and the storefront cannot disagree about what is free.
 */
export async function listLotsForAdmin(
  speciesSlug?: string,
): Promise<AdminLotRow[]> {
  const slug = speciesSlug?.trim();
  const rows = await db.lot.findMany({
    where:
      slug !== undefined && slug !== ""
        ? { species: { is: { slug } } }
        : undefined,
    select: {
      id: true,
      landedAt: true,
      totalGrams: true,
      reservedGrams: true,
      status: true,
      notes: true,
      species: { select: { name: true, slug: true } },
    },
    orderBy: [{ landedAt: "desc" }, { createdAt: "desc" }],
    take: LOT_LIST_LIMIT,
  });

  return rows.map((row) => ({
    id: row.id,
    speciesName: row.species.name,
    speciesSlug: row.species.slug,
    landedAt: row.landedAt,
    totalGrams: row.totalGrams,
    reservedGrams: row.reservedGrams,
    availableGrams: availableGrams({
      totalGrams: row.totalGrams,
      reservedGrams: row.reservedGrams,
      status: row.status,
    }),
    status: row.status,
    notes: row.notes,
  }));
}

/** Species id resolved from its slug, or null when it does not exist. */
export async function speciesIdBySlug(slug: string): Promise<string | null> {
  const species = await db.species.findUnique({
    where: { slug },
    select: { id: true },
  });
  return species?.id ?? null;
}

/**
 * OPEN landings of one species around `landedAt`, for the duplicate rule.
 * Only OPEN lots are relevant: a closed landing no longer sells, so landing
 * the same weight on the same day again is legitimate.
 */
export async function openLotsNearLandedAt(
  speciesId: string,
  landedAt: Date,
): Promise<{ landedAt: Date; totalGrams: number }[]> {
  return db.lot.findMany({
    where: {
      speciesId,
      status: "OPEN",
      landedAt: {
        gte: new Date(landedAt.getTime() - DUPLICATE_WINDOW_MS),
        lte: new Date(landedAt.getTime() + DUPLICATE_WINDOW_MS),
      },
    },
    select: { landedAt: true, totalGrams: true },
  });
}

/** Inserts one landing exactly as the pure mapping built it. */
export async function createLotRecord(insert: LotInsert): Promise<void> {
  await db.lot.create({ data: insert });
}

/**
 * Closes one OPEN landing. Returns false when the row was missing or already
 * CLOSED (the update matches no row), so the action can report a stale page
 * instead of pretending it closed something.
 */
export async function closeLotById(id: string): Promise<boolean> {
  const result = await db.lot.updateMany({
    where: { id, status: "OPEN" },
    // reservedGrams is deliberately absent: closing keeps reservations.
    data: { status: "CLOSED" },
  });
  return result.count === 1;
}
