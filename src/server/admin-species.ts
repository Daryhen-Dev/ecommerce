// Species (especies) persistence for the admin panel. Thin data access only:
// Prisma queries and the two transactions that keep a species and its tiers
// consistent. No parsing, no messages, no rules here — those live in the pure
// `@/lib/admin-species`.
//
// Two invariants are enforced by construction instead of by trust:
// - Tier replacement is delete-then-recreate inside ONE transaction, so a
//   failed update never leaves a species with half its tiers (the quote engine
//   would reject a CUSTOM species with no tiers).
// - Season deletion is scoped by `speciesId`, so a stale or tampered season id
//   can never delete another species's window.

import "server-only";

import { db } from "@/lib/db";
import type {
  SpeciesCreateValues,
  SpeciesValues,
} from "@/lib/admin-species";
import type { DiscountPolicy, DiscountTier, VatCategory } from "@/domain/pricing";
import type { SeasonWindow } from "@/domain/season";

/** List page size for the admin species list (no pagination framework). */
export const SPECIES_LIST_LIMIT = 200;

/** One row of the admin species list. */
export interface AdminSpeciesRow {
  id: string;
  slug: string;
  name: string;
  pricePerKgCents: number;
  minOrderGrams: number;
  orderStepGrams: number;
  discountPolicy: DiscountPolicy;
  vatCategory: VatCategory;
  isSeasonal: boolean;
  active: boolean;
  seasonCount: number;
}

/** One editable tier row as the edit page renders it. */
export interface AdminTierRow {
  id: string;
  minTotalGrams: number;
  discountBps: number;
}

/** One season window as the edit page renders it. */
export interface AdminSeasonRow {
  id: string;
  startsAt: Date;
  endsAt: Date;
}

/** Everything the edit page needs about one species. */
export interface AdminSpeciesDetail extends AdminSpeciesRow {
  description: string | null;
  tiers: AdminTierRow[];
  seasons: AdminSeasonRow[];
}

/** Every species, Spanish-collated by name: the panel edits all of them. */
export async function listSpeciesForAdmin(): Promise<AdminSpeciesRow[]> {
  const rows = await db.species.findMany({
    select: {
      id: true,
      slug: true,
      name: true,
      pricePerKgCents: true,
      minOrderGrams: true,
      orderStepGrams: true,
      discountPolicy: true,
      vatCategory: true,
      isSeasonal: true,
      active: true,
      _count: { select: { seasons: true } },
    },
    take: SPECIES_LIST_LIMIT,
  });

  return rows
    .map((row) => ({
      id: row.id,
      slug: row.slug,
      name: row.name,
      pricePerKgCents: row.pricePerKgCents,
      minOrderGrams: row.minOrderGrams,
      orderStepGrams: row.orderStepGrams,
      discountPolicy: row.discountPolicy,
      vatCategory: row.vatCategory,
      isSeasonal: row.isSeasonal,
      active: row.active,
      seasonCount: row._count.seasons,
    }))
    .sort((a, b) => a.name.localeCompare(b.name, "es"));
}

/** One species with its tiers and seasons, or null when the slug is unknown. */
export async function getSpeciesForAdmin(
  slug: string,
): Promise<AdminSpeciesDetail | null> {
  const row = await db.species.findUnique({
    where: { slug },
    select: {
      id: true,
      slug: true,
      name: true,
      description: true,
      pricePerKgCents: true,
      minOrderGrams: true,
      orderStepGrams: true,
      discountPolicy: true,
      vatCategory: true,
      isSeasonal: true,
      active: true,
      seasons: {
        select: { id: true, startsAt: true, endsAt: true },
        orderBy: { startsAt: "asc" },
      },
      discountTiers: {
        select: { id: true, minTotalGrams: true, discountBps: true },
        orderBy: { minTotalGrams: "asc" },
      },
    },
  });
  if (row === null) {
    return null;
  }

  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    description: row.description,
    pricePerKgCents: row.pricePerKgCents,
    minOrderGrams: row.minOrderGrams,
    orderStepGrams: row.orderStepGrams,
    discountPolicy: row.discountPolicy,
    vatCategory: row.vatCategory,
    isSeasonal: row.isSeasonal,
    active: row.active,
    seasonCount: row.seasons.length,
    tiers: row.discountTiers,
    seasons: row.seasons,
  };
}

/**
 * True when a species already owns the slug. The form needs this before it
 * tries to insert, so the operator gets a field-level message instead of a raw
 * constraint violation.
 */
export async function isSlugTaken(slug: string): Promise<boolean> {
  const existing = await db.species.findUnique({
    where: { slug },
    select: { id: true },
  });
  return existing !== null;
}

/**
 * Inserts a species and, when the policy is CUSTOM, its tiers in one
 * transaction: a CUSTOM species without tiers cannot be priced, so it must
 * never exist even for a moment.
 */
export async function createSpeciesRecord(
  values: SpeciesCreateValues,
  tiers: readonly DiscountTier[],
): Promise<void> {
  await db.$transaction(async (tx) => {
    const species = await tx.species.create({
      data: {
        slug: values.slug,
        name: values.name,
        description: values.description,
        pricePerKgCents: values.pricePerKgCents,
        minOrderGrams: values.minOrderGrams,
        orderStepGrams: values.orderStepGrams,
        discountPolicy: values.discountPolicy,
        vatCategory: values.vatCategory,
        isSeasonal: values.isSeasonal,
      },
      select: { id: true },
    });

    if (values.discountPolicy === "CUSTOM" && tiers.length > 0) {
      await tx.discountTier.createMany({
        data: tiers.map((tier) => ({
          speciesId: species.id,
          minTotalGrams: tier.minTotalGrams,
          discountBps: tier.discountBps,
        })),
      });
    }
  });
}

/**
 * Updates a species and replaces its tier set atomically. A non-CUSTOM policy
 * removes the stale tiers instead of keeping rows that no longer apply: the
 * quote engine ignores them, so leaving them behind would only mislead the
 * operator on the next visit.
 */
export async function updateSpeciesRecord(
  speciesId: string,
  values: SpeciesValues,
  tiers: readonly DiscountTier[],
): Promise<void> {
  await db.$transaction(async (tx) => {
    await tx.species.update({
      where: { id: speciesId },
      data: {
        // `slug` is deliberately absent: it is immutable after creation.
        name: values.name,
        description: values.description,
        pricePerKgCents: values.pricePerKgCents,
        minOrderGrams: values.minOrderGrams,
        orderStepGrams: values.orderStepGrams,
        discountPolicy: values.discountPolicy,
        vatCategory: values.vatCategory,
        isSeasonal: values.isSeasonal,
      },
    });

    await tx.discountTier.deleteMany({ where: { speciesId } });
    if (values.discountPolicy === "CUSTOM" && tiers.length > 0) {
      await tx.discountTier.createMany({
        data: tiers.map((tier) => ({
          speciesId,
          minTotalGrams: tier.minTotalGrams,
          discountBps: tier.discountBps,
        })),
      });
    }
  });
}

/** Appends one season window to a species. */
export async function addSeasonRecord(
  speciesId: string,
  window: SeasonWindow,
): Promise<void> {
  await db.season.create({
    data: { speciesId, startsAt: window.startsAt, endsAt: window.endsAt },
  });
}

/**
 * Deletes one season window of one species. Returns false when the row was
 * missing or belongs to another species, so a stale page reports "already
 * removed" instead of pretending it deleted something.
 */
export async function deleteSeasonRecord(
  speciesId: string,
  seasonId: string,
): Promise<boolean> {
  const result = await db.season.deleteMany({
    where: { id: seasonId, speciesId },
  });
  return result.count === 1;
}

/**
 * True when the database refused a write because of a unique constraint — the
 * slug of a new species, in practice. The Server Action turns it into a
 * field-level Spanish message instead of a 500, because the pre-check and the
 * insert are not atomic: another operator can take the slug in between.
 */
export function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code: unknown }).code === "P2002"
  );
}
