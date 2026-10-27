// Create-flight page (A4). The airport list and the prefilled window are
// computed on the server (the same offsets the operator sees are the ones the
// server validates), so the browser never has to guess a time zone.

import type { Metadata } from "next";
import Link from "next/link";

import { createShipment } from "@/app/admin/(panel)/shipments/new/actions";
import AdminCard from "@/components/admin/AdminCard";
import ShipmentForm from "@/components/admin/ShipmentForm";
import { buildDefaultShipmentWindow } from "@/lib/admin-shipments";
import { listAirportIdOptions } from "@/server/admin-shipments";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Nuevo vuelo | Pesca Artesanal Galápagos",
};

export default async function NewShipmentPage() {
  const airports = await listAirportIdOptions();
  const defaults = buildDefaultShipmentWindow(new Date());

  return (
    <div>
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h1 className="text-3xl font-bold sm:text-4xl">Nuevo vuelo</h1>
        <Link href="/admin/shipments" className="font-medium underline underline-offset-4">
          Volver a vuelos
        </Link>
      </div>
      <p className="mt-3 max-w-2xl text-neutral-700">
        Las fechas vienen propuestas con los horarios habituales: cierre dos
        días antes a las 18:00, salida 14 horas después, llegada 2 horas
        después de la salida y retiro de 3 horas desde la llegada. Ajústalas si
        el vuelo es distinto.
      </p>

      <div className="mt-8">
        <AdminCard>
          {airports.length === 0 ? (
            <p className="text-neutral-700">
              No hay aeropuertos activos para programar un vuelo.
            </p>
          ) : (
            <ShipmentForm action={createShipment} airports={airports} defaults={defaults} />
          )}
        </AdminCard>
      </div>
    </div>
  );
}
