import "dotenv/config";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const adapter = new PrismaPg({
  connectionString: process.env.DATABASE_URL,
});
const db = new PrismaClient({ adapter });

const AIRPORTS = [
  {
    code: "UIO",
    city: "Quito",
    name: "Aeropuerto Internacional Mariscal Sucre",
  },
  {
    code: "GYE",
    city: "Guayaquil",
    name: "Aeropuerto Internacional José Joaquín de Olmedo",
  },
  {
    code: "CUE",
    city: "Cuenca",
    name: "Aeropuerto Mariscal Lamar",
  },
] as const;

// PLACEHOLDER VALUES for the owner to replace: global volume-discount tiers
// selected by the order's total grams across species. Replace the discountBps
// values once real percentages are confirmed.
const GLOBAL_DISCOUNT_TIERS = [
  { minTotalGrams: 0, discountBps: 0 },
  { minTotalGrams: 5000, discountBps: 500 },
  { minTotalGrams: 10000, discountBps: 1000 },
] as const;

async function main(): Promise<void> {
  for (const airport of AIRPORTS) {
    await db.airport.upsert({
      where: { code: airport.code },
      update: { city: airport.city, name: airport.name },
      create: airport,
    });
  }

  for (const tier of GLOBAL_DISCOUNT_TIERS) {
    const existing = await db.discountTier.findFirst({
      where: { speciesId: null, minTotalGrams: tier.minTotalGrams },
    });
    if (existing) {
      await db.discountTier.update({
        where: { id: existing.id },
        data: { discountBps: tier.discountBps },
      });
    } else {
      await db.discountTier.create({
        data: { speciesId: null, ...tier },
      });
    }
  }
}

main()
  .then(() => {
    console.log("Seed completed.");
  })
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => {
    void db.$disconnect();
  });
