import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { cache } from "react";

import FlightCard from "@/components/FlightCard";
import SpeciesCard from "@/components/SpeciesCard";
import CartLink from "@/components/cart/CartLink";
import { getCityCatalog } from "@/server/catalog";

export const dynamic = "force-dynamic";

// Memoized per request so generateMetadata and the page share one DB read.
const getCatalog = cache(getCityCatalog);

type PageProps = { params: Promise<{ airport: string }> };

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const { airport } = await params;
  const catalog = await getCatalog(airport);
  if (!catalog) {
    return {};
  }
  return {
    title: `Pescado fresco en ${catalog.airport.city} | Pesca Artesanal Galápagos`,
  };
}

export default async function CityCatalogPage({ params }: PageProps) {
  const { airport } = await params;
  const catalog = await getCatalog(airport);
  if (!catalog) {
    notFound();
  }

  // Row-level data problems were skipped by the mapping; log them server-side
  // (no PII) instead of failing the page.
  for (const warning of catalog.warnings) {
    console.warn(`[catalog ${catalog.airport.code}] ${warning}`);
  }

  return (
    <main className="mx-auto w-full max-w-4xl px-6 py-12">
      <h1 className="text-3xl font-bold sm:text-4xl">
        Pescado fresco para retirar en {catalog.airport.city}
      </h1>
      <div className="mt-3 flex items-center gap-4">
        <Link
          href="/"
          className="font-medium underline underline-offset-4 hover:text-neutral-600 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
        >
          Cambiar ciudad
        </Link>
        {catalog.shipment !== null && (
          <CartLink airportCode={catalog.airport.code} shipmentId={catalog.shipment.id} />
        )}
      </div>

      <div className="mt-8">
        <FlightCard city={catalog.airport.city} shipment={catalog.shipment} />
      </div>

      <section aria-labelledby="species-heading" className="mt-12">
        <h2 id="species-heading" className="text-2xl font-semibold">
          Especies para tu pedido
        </h2>
        <ul className="mt-6 grid gap-4 sm:grid-cols-2">
          {catalog.items.map((item) => (
            <li key={item.slug} className="h-full">
              <SpeciesCard
                item={item}
                orderable={catalog.shipment !== null}
                shipmentId={catalog.shipment?.id ?? null}
              />
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
