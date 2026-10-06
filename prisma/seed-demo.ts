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
  });

  const [speciesCount, seasonCount, lotCount, shipmentCount] =
    await Promise.all([
      db.species.count(),
      db.season.count(),
      db.lot.count(),
      db.shipment.count(),
    ]);
  console.log(
    `Demo seed completed. species=${speciesCount} seasons=${seasonCount} lots=${lotCount} shipments=${shipmentCount}`,
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
