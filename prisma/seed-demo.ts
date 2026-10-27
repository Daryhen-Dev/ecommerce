// DEV-ONLY demo data for local development and E2E tests. Never run against
// production: the script refuses to start unless DATABASE_URL points at a
// local database and NODE_ENV is not "production".
//
// Run after the base seed (`pnpm db:seed`), which provides airports, global
// discount tiers and tax rates. This script adds demo species, seasons, lots
// and shipments whose dates are relative to "now", so the storefront always
// has an open flight to order against.
//
// Idempotency contract:
// - Species are upserted by their stable slug.
// - Rows without a natural key (seasons, lots, shipments, demo custom tiers)
//   are delete-then-recreate inside one transaction, matched only by DEMO
//   markers (notes / flightNumber prefixes) or by belonging to demo species.
//   Rows without a DEMO marker and species that are not demo species are
//   never touched.
import "dotenv/config";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
// The demo orders are priced by the real pricing domain, not by hand: the seed
// must produce amounts the quote engine itself would produce, so a rule change
// cannot leave the demo data inconsistent with the panel or the storefront.
import { priceOrder, type DiscountTier } from "../src/domain/pricing";
import { cents } from "../src/domain/money";
import { grams } from "../src/domain/weight";

// Ecuador mainland (America/Guayaquil) has no DST and is fixed at UTC-5.
const ECUADOR_UTC_OFFSET_HOURS = 5;

const HOURS_PER_DAY = 24;
const MS_PER_HOUR = 3_600_000;
const MS_PER_DAY = HOURS_PER_DAY * MS_PER_HOUR;

function guard(): void {
  if (process.env.NODE_ENV === "production") {
    console.error(
      "Refusing to seed demo data: NODE_ENV is production. This seed is for local development only.",
    );
    process.exit(1);
  }

  const url = process.env.DATABASE_URL;
  if (!url || url.trim() === "") {
    console.error("DATABASE_URL is not set. Copy .env.example to .env first.");
    process.exit(1);
  }

  let host: string;
  try {
    host = new URL(url).hostname;
  } catch {
    console.error(
      "DATABASE_URL is not a valid connection URL (value not shown).",
    );
    process.exit(1);
  }

  if (host !== "localhost" && host !== "127.0.0.1") {
    console.error(
      `Refusing to seed demo data: DATABASE_URL points at non-local host "${host}". This seed is for local development only.`,
    );
    process.exit(1);
  }
}

const adapter = new PrismaPg({
  connectionString: process.env.DATABASE_URL,
});
const db = new PrismaClient({ adapter });

guard();

// Date at `hourLocal` Ecuador wall-clock time, `daysFromNow` days from now.
function atEcuadorHour(daysFromNow: number, hourLocal: number): Date {
  const shifted = new Date(Date.now() + daysFromNow * MS_PER_DAY);
  // Convert to Ecuador wall clock, then read the Y/M/D fields as UTC.
  const local = new Date(
    shifted.getTime() - ECUADOR_UTC_OFFSET_HOURS * MS_PER_HOUR,
  );
  return new Date(
    Date.UTC(
      local.getUTCFullYear(),
      local.getUTCMonth(),
      local.getUTCDate(),
      hourLocal + ECUADOR_UTC_OFFSET_HOURS,
      0,
      0,
      0,
    ),
  );
}

type SpeciesSpec = {
  slug: string;
  name: string;
  description: string;
  pricePerKgCents: number;
  discountPolicy: "GLOBAL" | "CUSTOM" | "NONE";
  isSeasonal?: boolean;
  minOrderGrams?: number;
  orderStepGrams?: number;
};

const DEMO_SPECIES: SpeciesSpec[] = [
  {
    slug: "wahoo",
    name: "Wahoo (Guajo)",
    description:
      "Carne blanca y firme, ideal a la plancha o en ceviche. Pesca artesanal de Galápagos.",
    pricePerKgCents: 900,
    discountPolicy: "GLOBAL",
  },
  {
    slug: "yellowfin-tuna",
    name: "Atún aleta amarilla",
    description:
      "Atún fresco de pesca artesanal, carne roja y sabrosa. Perfecto para sashimi o sellado.",
    pricePerKgCents: 1100,
    discountPolicy: "GLOBAL",
  },
  {
    slug: "grouper",
    name: "Bacalao de Galápagos",
    description:
      "Pescado de carne blanca y textura delicada, muy apreciado localmente.",
    pricePerKgCents: 1400,
    discountPolicy: "GLOBAL",
  },
  {
    slug: "snapper",
    name: "Pargo",
    description:
      "Pargo colorado fresco, versátil para horno, sopa o filete a la plancha.",
    pricePerKgCents: 1200,
    discountPolicy: "CUSTOM",
  },
  {
    slug: "spiny-lobster",
    name: "Langosta espinosa",
    description:
      "Langosta espinosa de Galápagos. Venta solo dentro de la temporada de pesca.",
    pricePerKgCents: 3800,
    discountPolicy: "NONE",
    isSeasonal: true,
    minOrderGrams: 500,
    orderStepGrams: 500,
  },
  {
    slug: "mahi-mahi",
    name: "Dorado",
    description:
      "Dorado fresco de carne firme y dulce. Especie de temporada: vuelve con la próxima temporada.",
    pricePerKgCents: 1000,
    discountPolicy: "GLOBAL",
    isSeasonal: true,
  },
];

// Protected species (e.g. sea cucumber) are intentionally NOT included.
const SEASONAL_DEMO_SLUGS = ["spiny-lobster", "mahi-mahi"];

// CUSTOM tiers for snapper, selected by the order's total grams across
// species (same selection rule as global tiers; only the percentages differ).
const SNAPPER_TIERS = [
  { minTotalGrams: 0, discountBps: 0 },
  { minTotalGrams: 3000, discountBps: 300 },
  { minTotalGrams: 8000, discountBps: 800 },
] as const;

type LotSpec = {
  speciesSlug: string;
  notes: string;
  totalGrams: number;
  reservedGrams: number;
  status: "OPEN" | "CLOSED";
  landedDaysAgo: number;
};

const DEMO_LOTS: LotSpec[] = [
  {
    speciesSlug: "wahoo",
    notes: "DEMO-lot-wahoo-open",
    totalGrams: 120_000,
    reservedGrams: 30_000,
    status: "OPEN",
    landedDaysAgo: 2,
  },
  {
    speciesSlug: "yellowfin-tuna",
    notes: "DEMO-lot-yellowfin-tuna-open",
    totalGrams: 200_000,
    reservedGrams: 0,
    status: "OPEN",
    landedDaysAgo: 2,
  },
  {
    speciesSlug: "yellowfin-tuna",
    notes: "DEMO-lot-yellowfin-tuna-closed",
    totalGrams: 50_000,
    reservedGrams: 0,
    status: "CLOSED",
    landedDaysAgo: 9,
  },
  {
    speciesSlug: "grouper",
    notes: "DEMO-lot-grouper-open",
    totalGrams: 60_000,
    reservedGrams: 0,
    status: "OPEN",
    landedDaysAgo: 2,
  },
  {
    speciesSlug: "grouper",
    notes: "DEMO-lot-grouper-soldout",
    totalGrams: 10_000,
    reservedGrams: 10_000,
    status: "OPEN",
    landedDaysAgo: 2,
  },
  {
    speciesSlug: "snapper",
    notes: "DEMO-lot-snapper-open",
    totalGrams: 80_000,
    reservedGrams: 0,
    status: "OPEN",
    landedDaysAgo: 2,
  },
  {
    speciesSlug: "spiny-lobster",
    notes: "DEMO-lot-spiny-lobster-open",
    totalGrams: 25_000,
    reservedGrams: 0,
    status: "OPEN",
    landedDaysAgo: 2,
  },
  {
    speciesSlug: "mahi-mahi",
    notes: "DEMO-lot-mahi-mahi-open",
    totalGrams: 40_000,
    reservedGrams: 0,
    status: "OPEN",
    landedDaysAgo: 2,
  },
];

const AIRPORT_CODES = ["UIO", "GYE", "CUE"] as const;

// --- demo orders (A6) -------------------------------------------------------
//
// There is no checkout yet, so the panel's orders section and its E2E need
// orders the seed creates. They all live on the DEMO-UIO-1 flight, carry a
// `DEMO-` pickup code prefix (the only thing the delete-then-recreate matches
// on) and use kilograms a customer could really order: every line respects its
// species' minimum and step, and the prices, tiers and VAT rate come from the
// database through the domain's `priceOrder`.
//
// Amounts (computed, see the panel for the rendered values):
// - DEMO-ORDER-PENDING: Wahoo 4 kg + Pargo 4 kg, 8 kg total.
//     wahoo  4 kg x $9.00 = $36.00 gross, 5% tier (8 kg) -> -$1.80, IVA 15% $5.13
//     pargo  4 kg x $12.00 = $48.00 gross, 8% custom tier -> -$3.84, IVA 15% $6.62
//     subtotal $84.00, descuento $5.64, IVA $11.75, total $90.11
// - DEMO-ORDER-PAID: Atún 6 kg + Bacalao 2 kg, 8 kg total.
//     atún    6 kg x $11.00 = $66.00 gross, 5% tier -> -$3.30, IVA 15% $9.41
//     bacalao 2 kg x $14.00 = $28.00 gross, 5% tier -> -$1.40, IVA 15% $3.99
//     subtotal $94.00, descuento $4.70, IVA $13.40, total $102.70
// - DEMO-ORDER-CANCELLED: Pargo 3 kg + Wahoo 3 kg, 6 kg total.
//     pargo 3 kg x $12.00 = $36.00 gross, 3% custom tier -> -$1.08, IVA 15% $5.24
//     wahoo 3 kg x $9.00 = $27.00 gross, 5% tier -> -$1.35, IVA 15% $3.85
//     subtotal $63.00, descuento $2.43, IVA $9.09, total $69.66
//
// The demo does NOT touch any lot's `reservedGrams`: stock reservation arrives
// with checkout, and the demo availability numbers are asserted by the
// storefront E2E.

type OrderItemSpec = {
  speciesSlug: string;
  /** Note of the OPEN demo lot the line would have taken its kilos from. */
  lotNotes: string;
  grams: number;
};

type OrderSpec = {
  code: string;
  status: "PENDING_PAYMENT" | "PAID" | "CANCELLED";
  customerName: string;
  customerEmail: string;
  customerPhone: string;
  customerIdNumber: string;
  /** Creation instant, relative to "now" so the demo never looks stale. */
  createdDaysAgo: number;
  /** Minutes after creation the payment landed (PAID orders only). */
  paidMinutesAfterCreation?: number;
  items: OrderItemSpec[];
};

// Fictitious customers: invented names, @example.com addresses, 099… mobile
// numbers and 10-digit cédulas. No real person is described here.
const DEMO_ORDERS: OrderSpec[] = [
  {
    code: "DEMO-ORDER-PENDING",
    status: "PENDING_PAYMENT",
    customerName: "María Fernanda Chávez Ruiz",
    customerEmail: "maria.chavez@example.com",
    customerPhone: "0991234567",
    customerIdNumber: "1712345678",
    createdDaysAgo: 1,
    items: [
      { speciesSlug: "wahoo", lotNotes: "DEMO-lot-wahoo-open", grams: 4000 },
      { speciesSlug: "snapper", lotNotes: "DEMO-lot-snapper-open", grams: 4000 },
    ],
  },
  {
    code: "DEMO-ORDER-PAID",
    status: "PAID",
    customerName: "Jorge Luis Andrade Salazar",
    customerEmail: "jorge.andrade@example.com",
    customerPhone: "0997654321",
    customerIdNumber: "0923456789",
    createdDaysAgo: 2,
    paidMinutesAfterCreation: 25,
    items: [
      {
        speciesSlug: "yellowfin-tuna",
        lotNotes: "DEMO-lot-yellowfin-tuna-open",
        grams: 6000,
      },
      { speciesSlug: "grouper", lotNotes: "DEMO-lot-grouper-open", grams: 2000 },
    ],
  },
  {
    code: "DEMO-ORDER-CANCELLED",
    status: "CANCELLED",
    customerName: "Ana Belén Cedeño Morán",
    customerEmail: "ana.cedeno@example.com",
    customerPhone: "0984567123",
    customerIdNumber: "1309876543",
    createdDaysAgo: 3,
    items: [
      { speciesSlug: "snapper", lotNotes: "DEMO-lot-snapper-open", grams: 3000 },
      { speciesSlug: "wahoo", lotNotes: "DEMO-lot-wahoo-open", grams: 3000 },
    ],
  },
];

/** Flight the demo orders belong to (the first UIO departure of week 1). */
const DEMO_ORDER_FLIGHT_NUMBER = "DEMO-UIO-1";


// Arrival adds extra flight time for Cuenca (1-2 extra stops).
function arrivalHoursFor(airportCode: string): number {
  return airportCode === "CUE" ? 5 : 2;
}

async function main(): Promise<void> {
  const airports = await db.airport.findMany({
    where: { code: { in: [...AIRPORT_CODES] } },
  });
  const airportsByCode = new Map(airports.map((a) => [a.code, a]));
  const missing = AIRPORT_CODES.filter((code) => !airportsByCode.has(code));
  if (missing.length > 0) {
    throw new Error(
      `Airports ${missing.join(", ")} not found. Run the base seed first: pnpm db:seed`,
    );
  }

  // Species upserts are safe outside the transaction: they are keyed by slug.
  for (const spec of DEMO_SPECIES) {
    const data = {
      name: spec.name,
      description: spec.description,
      pricePerKgCents: spec.pricePerKgCents,
      discountPolicy: spec.discountPolicy,
      isSeasonal: spec.isSeasonal ?? false,
      minOrderGrams: spec.minOrderGrams ?? 1000,
      orderStepGrams: spec.orderStepGrams ?? 500,
    };
    await db.species.upsert({ where: { slug: spec.slug }, update: data, create: { slug: spec.slug, ...data } });
  }

  await db.$transaction(async (tx) => {
    // Demo orders go FIRST: their items reference demo lots with an onDelete
    // Restrict foreign key, so deleting the lots before the orders would fail.
    // The `DEMO-` code prefix is the only thing this matches on; items go with
    // the order (that relation cascades).
    await tx.order.deleteMany({ where: { code: { startsWith: "DEMO-" } } });

    // Species created by the admin E2E (`e2e-species-*`) are residue: the panel
    // never deletes a species, so the spec that proves creation leaves one row
    // behind on every run. Deleting them here keeps the storefront and the
    // species list identical after a seed. The `lots`/`orderItems` guard is
    // deliberate: a species somebody actually used is never removed by a seed.
    await tx.species.deleteMany({
      where: {
        slug: { startsWith: "e2e-species-" },
        lots: { none: {} },
        orderItems: { none: {} },
      },
    });

    // Seasons of the two demo seasonal species: delete-then-recreate so the
    // windows stay relative to "now". Only demo species are touched.
    const speciesBySlug = new Map(
      (await tx.species.findMany()).map((s) => [s.slug, s]),
    );
    const seasonalIds = SEASONAL_DEMO_SLUGS.map(
      (slug) => speciesBySlug.get(slug)!.id,
    );
    await tx.season.deleteMany({ where: { speciesId: { in: seasonalIds } } });
    const now = new Date();
    await tx.season.createMany({
      data: [
        {
          speciesId: speciesBySlug.get("spiny-lobster")!.id,
          startsAt: new Date(now.getTime() - 30 * MS_PER_DAY),
          endsAt: new Date(now.getTime() + 60 * MS_PER_DAY),
        },
        {
          speciesId: speciesBySlug.get("mahi-mahi")!.id,
          startsAt: new Date(now.getTime() + 40 * MS_PER_DAY),
          endsAt: new Date(now.getTime() + 120 * MS_PER_DAY),
        },
      ],
    });

    // Snapper CUSTOM tiers: replace all tiers of the demo species so the set
    // is exactly the three demo rows (idempotent even if edited by hand).
    const snapper = await tx.species.findUnique({ where: { slug: "snapper" } });
    if (!snapper) throw new Error("Demo species snapper not found after upsert.");
    await tx.discountTier.deleteMany({ where: { speciesId: snapper.id } });
    await tx.discountTier.createMany({
      data: SNAPPER_TIERS.map((tier) => ({
        speciesId: snapper.id,
        minTotalGrams: tier.minTotalGrams,
        discountBps: tier.discountBps,
      })),
    });

    // Lots carrying the DEMO marker: delete-then-recreate.
    await tx.lot.deleteMany({
      where: { notes: { startsWith: "DEMO-" } },
    });
    await tx.lot.createMany({
      data: DEMO_LOTS.map((lot) => ({
        speciesId: speciesBySlug.get(lot.speciesSlug)!.id,
        landedAt: new Date(Date.now() - lot.landedDaysAgo * MS_PER_DAY),
        totalGrams: lot.totalGrams,
        reservedGrams: lot.reservedGrams,
        status: lot.status,
        notes: lot.notes,
      })),
    });

    // Shipments carrying the DEMO marker: delete-then-recreate.
    await tx.shipment.deleteMany({
      where: { flightNumber: { startsWith: "DEMO-" } },
    });
    const shipments: {
      airportId: string;
      carrier: string;
      flightNumber: string;
      orderCutoffAt: Date;
      departsAt: Date;
      estimatedArrivalAt: Date;
      pickupStartsAt: Date;
      pickupEndsAt: Date;
      status: "SCHEDULED" | "COMPLETED";
    }[] = [];
    for (const code of AIRPORT_CODES) {
      const airportId = airportsByCode.get(code)!.id;
      for (const weekOffset of [0, 1]) {
        const cutoff = atEcuadorHour(2 + weekOffset * 7, 18);
        const departs = new Date(cutoff.getTime() + 14 * MS_PER_HOUR);
        const arrival = new Date(
          departs.getTime() + arrivalHoursFor(code) * MS_PER_HOUR,
        );
        shipments.push({
          airportId,
          carrier: "Carga aérea (demo)",
          flightNumber: `DEMO-${code}-${weekOffset + 1}`,
          orderCutoffAt: cutoff,
          departsAt: departs,
          estimatedArrivalAt: arrival,
          pickupStartsAt: arrival,
          pickupEndsAt: new Date(arrival.getTime() + 3 * MS_PER_HOUR),
          status: "SCHEDULED",
        });
      }
    }
    // One past UIO shipment whose cutoff was yesterday, completed: proves the
    // storefront ignores non-orderable shipments.
    const pastCutoff = atEcuadorHour(-1, 18);
    const pastDeparts = new Date(pastCutoff.getTime() + 14 * MS_PER_HOUR);
    const pastArrival = new Date(pastDeparts.getTime() + 2 * MS_PER_HOUR);
    shipments.push({
      airportId: airportsByCode.get("UIO")!.id,
      carrier: "Carga aérea (demo)",
      flightNumber: "DEMO-UIO-PAST",
      orderCutoffAt: pastCutoff,
      departsAt: pastDeparts,
      estimatedArrivalAt: pastArrival,
      pickupStartsAt: pastArrival,
      pickupEndsAt: new Date(pastArrival.getTime() + 3 * MS_PER_HOUR),
      status: "COMPLETED",
    });
    await tx.shipment.createMany({ data: shipments });

    // --- demo orders -------------------------------------------------------
    // They are priced with the real domain: global tiers, the species' custom
    // tiers and the STANDARD VAT rate in force are read from the database, so
    // the stored line values are exactly what the quote engine would charge.
    const orderShipment = await tx.shipment.findFirst({
      where: { flightNumber: DEMO_ORDER_FLIGHT_NUMBER },
      select: { id: true },
    });
    if (!orderShipment) {
      throw new Error(
        `Shipment ${DEMO_ORDER_FLIGHT_NUMBER} not found after seeding shipments.`,
      );
    }

    const globalTiers: DiscountTier[] = (
      await tx.discountTier.findMany({
        where: { speciesId: null },
        select: { minTotalGrams: true, discountBps: true },
      })
    ).map((tier) => ({
      minTotalGrams: tier.minTotalGrams,
      discountBps: tier.discountBps,
    }));
    if (globalTiers.length === 0) {
      throw new Error(
        "Global discount tiers not found. Run the base seed first: pnpm db:seed",
      );
    }

    // `now` is the transaction's instant, declared with the seasons above.
    const standardRate = await tx.taxRate.findFirst({
      where: { category: "STANDARD", effectiveFrom: { lte: now } },
      orderBy: { effectiveFrom: "desc" },
      select: { rateBps: true },
    });
    if (!standardRate) {
      throw new Error(
        "STANDARD VAT rate not found. Run the base seed first: pnpm db:seed",
      );
    }

    const speciesBySlugForOrders = new Map(
      (await tx.species.findMany()).map((species) => [species.slug, species]),
    );
    const lotIdByNotes = new Map(
      (
        await tx.lot.findMany({
          where: { notes: { startsWith: "DEMO-" } },
          select: { id: true, notes: true },
        })
      ).map((lot) => [lot.notes, lot.id]),
    );
    const speciesSpecBySlug = new Map(
      DEMO_SPECIES.map((species) => [species.slug, species]),
    );

    for (const spec of DEMO_ORDERS) {
      const speciesIds: string[] = [];
      const lotIds: string[] = [];
      const lines = spec.items.map((item, index) => {
        const species = speciesBySlugForOrders.get(item.speciesSlug);
        const speciesSpec = speciesSpecBySlug.get(item.speciesSlug);
        const lotId = lotIdByNotes.get(item.lotNotes);
        if (!species || !speciesSpec || !lotId) {
          throw new Error(
            `Demo order ${spec.code}: species ${item.speciesSlug} or lot ${item.lotNotes} not found.`,
          );
        }
        speciesIds[index] = species.id;
        lotIds[index] = lotId;
        return {
          speciesId: species.id,
          grams: grams(item.grams),
          pricePerKgCents: cents(speciesSpec.pricePerKgCents),
          discountPolicy: speciesSpec.discountPolicy,
          customTiers:
            speciesSpec.discountPolicy === "CUSTOM"
              ? SNAPPER_TIERS.map((tier) => ({
                  minTotalGrams: tier.minTotalGrams,
                  discountBps: tier.discountBps,
                }))
              : undefined,
          vatCategory: "STANDARD" as const,
        };
      });

      const priced = priceOrder({
        lines,
        globalTiers,
        vatRatesBps: { STANDARD: standardRate.rateBps, ZERO_RATED: 0 },
      });

      const createdAt = new Date(now.getTime() - spec.createdDaysAgo * MS_PER_DAY);
      const paidAt =
        spec.paidMinutesAfterCreation === undefined
          ? null
          : new Date(createdAt.getTime() + spec.paidMinutesAfterCreation * 60_000);

      await tx.order.create({
        data: {
          code: spec.code,
          shipmentId: orderShipment.id,
          customerName: spec.customerName,
          customerEmail: spec.customerEmail,
          customerPhone: spec.customerPhone,
          customerIdNumber: spec.customerIdNumber,
          status: spec.status,
          totalGrams: priced.totalGrams,
          subtotalCents: priced.subtotalCents,
          discountCents: priced.discountCents,
          vatCents: priced.vatCents,
          totalCents: priced.totalCents,
          paidAt,
          createdAt,
          items: {
            create: priced.lines.map((line, index) => ({
              speciesId: speciesIds[index],
              lotId: lotIds[index],
              grams: line.grams,
              pricePerKgCents: line.pricePerKgCents,
              discountBps: line.discountBps,
              vatRateBps: line.vatRateBps,
              grossCents: line.grossCents,
              discountCents: line.discountCents,
              vatCents: line.vatCents,
              lineTotalCents: line.lineTotalCents,
            })),
          },
        },
      });
    }
  });

  const [speciesCount, seasonCount, lotCount, shipmentCount, orderCount] =
    await Promise.all([
      db.species.count(),
      db.season.count(),
      db.lot.count(),
      db.shipment.count(),
      db.order.count(),
    ]);
  console.log(
    `Demo seed completed. species=${speciesCount} seasons=${seasonCount} lots=${lotCount} shipments=${shipmentCount} orders=${orderCount}`,
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => {
    void db.$disconnect();
  });
