import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { cache } from "react";

import FlightCard from "@/components/FlightCard";
import CartView from "@/components/cart/CartView";
import { getCityCatalog, listOtherCurrentShipmentIds } from "@/server/catalog";

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
    title: `Tu carrito | Pesca Artesanal Galápagos`,
  };
}

export default async function CartPage({ params }: PageProps) {
  const { airport } = await params;
  const catalog = await getCatalog(airport);
  if (!catalog) {
    notFound();
  }

  // Row-level data problems were skipped by the mapping; log them server-side
  // (no PII) instead of failing the page.
  for (const warning of catalog.warnings) {
    console.warn(`[cart ${catalog.airport.code}] ${warning}`);
  }

  // Current orderable shipment ids of the other cities: their carts are
  // live (untouched here); anything else stored in the browser is stale.
  const otherCityShipmentIds = await listOtherCurrentShipmentIds(
    catalog.airport.code,
  );

  const items = catalog.items.map((item) => ({
    slug: item.slug,
    name: item.name,
    pricePerKgCents: item.pricePerKgCents,
    minOrderGrams: item.minOrderGrams,
    orderStepGrams: item.orderStepGrams,
    availableGrams:
      item.availability.state === "AVAILABLE"
        ? item.availability.availableGrams
        : null,
  }));

  const shipment = catalog.shipment;

  return (
    <main className="mx-auto w-full max-w-4xl px-6 py-12">
      <h1 className="text-3xl font-bold sm:text-4xl">Tu carrito</h1>
      <div className="mt-8">
        <FlightCard city={catalog.airport.city} shipment={shipment} />
      </div>
      <CartView
        airportCode={catalog.airport.code}
        shipmentId={shipment?.id ?? ""}
        items={items}
        otherCityShipmentIds={otherCityShipmentIds}
      />
    </main>
  );
}
