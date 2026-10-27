// Flights (vuelos) list for the panel (A4): grouped per airport in the
// storefront order (UIO, GYE, CUE), ordered by cutoff inside each group, with
// a per-row "Cerrar" action for SCHEDULED flights.
//
// Grouping instead of a filter select: the cooperative schedules a handful of
// flights per city, and seeing all three airports at once is what the daily
// operation needs (the storefront filters by city, the panel must not).

import type { Metadata } from "next";
import Link from "next/link";

import { closeShipmentAction } from "@/app/admin/(panel)/shipments/actions";
import AdminCard from "@/components/admin/AdminCard";
import { inlineButtonClass } from "@/components/admin/form-styles";
import { formatEcuadorDateTime } from "@/lib/format";
import {
  listShipmentsForAdmin,
  type AdminShipmentRow,
} from "@/server/admin-shipments";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Vuelos | Pesca Artesanal Galápagos",
};

type ShipmentsPageProps = {
  searchParams: Promise<{ created?: string }>;
};

const STATUS_LABELS: Record<AdminShipmentRow["status"], string> = {
  SCHEDULED: "Abierto",
  CLOSED: "Cerrado",
  IN_TRANSIT: "En vuelo",
  ARRIVED: "Llegado",
  COMPLETED: "Completado",
};

/** Text badge: the status is always written, never color-only. */
function ShipmentStatusBadge({ status }: { status: AdminShipmentRow["status"] }) {
  const open = status === "SCHEDULED";
  return (
    <span
      className={`inline-block rounded border px-2 py-0.5 text-xs font-medium ${
        open
          ? "border-green-700 bg-green-100 text-green-950"
          : "border-neutral-500 bg-neutral-100 text-neutral-800"
      }`}
    >
      {STATUS_LABELS[status]}
    </span>
  );
}

export default async function AdminShipmentsPage({ searchParams }: ShipmentsPageProps) {
  const { created } = await searchParams;
  const shipments = await listShipmentsForAdmin();

  // One bucket per airport, preserving the airport order the query applied.
  const groups: { code: string; city: string; rows: AdminShipmentRow[] }[] = [];
  for (const shipment of shipments) {
    const group = groups.find((entry) => entry.code === shipment.airportCode);
    if (group === undefined) {
      groups.push({
        code: shipment.airportCode,
        city: shipment.airportCity,
        rows: [shipment],
      });
    } else {
      group.rows.push(shipment);
    }
  }

  return (
    <div>
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h1 className="text-3xl font-bold sm:text-4xl">Vuelos</h1>
        <Link href="/admin" className="font-medium underline underline-offset-4">
          Panel
        </Link>
      </div>
      <p className="mt-3 max-w-2xl text-neutral-700">
        Cada vuelo abre pedidos hasta su cierre y los cierra al salir. Cerrar
        un vuelo lo saca de la tienda de inmediato; la carga compartida de los
        desembarques no cambia.
      </p>

      <p role="status" aria-live="polite" className="mt-4 text-sm font-medium text-green-800">
        {created === "1" ? "Vuelo programado." : ""}
      </p>

      <div className="mt-4 flex flex-wrap gap-3">
        <Link
          href="/admin/shipments/new"
          className="rounded-md bg-neutral-900 px-4 py-2 font-medium text-white hover:bg-neutral-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
        >
          Programar vuelo
        </Link>
        <Link href="/admin/lots" className="font-medium underline underline-offset-4">
          Ver desembarques
        </Link>
      </div>

      {groups.length === 0 ? (
        <p className="mt-6 text-neutral-700">No hay vuelos programados.</p>
      ) : (
        <div className="mt-6 flex flex-col gap-6">
          {groups.map((group) => (
            <section key={group.code} aria-labelledby={`airport-${group.code}`}>
              <h2 id={`airport-${group.code}`} className="text-xl font-semibold">
                {group.city} ({group.code})
              </h2>
              <div className="mt-3">
                <AdminCard>
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[44rem] border-collapse text-left text-sm">
                      <caption className="sr-only">
                        Vuelos de {group.city}, del cierre más próximo al más lejano.
                      </caption>
                      <thead>
                        <tr className="border-b border-neutral-300">
                          <th scope="col" className="py-2 pr-3 font-semibold">
                            Vuelo
                          </th>
                          <th scope="col" className="py-2 pr-3 font-semibold">
                            Cierre de pedidos
                          </th>
                          <th scope="col" className="py-2 pr-3 font-semibold">
                            Salida
                          </th>
                          <th scope="col" className="py-2 pr-3 font-semibold">
                            Llegada estimada
                          </th>
                          <th scope="col" className="py-2 pr-3 font-semibold">
                            Retiro
                          </th>
                          <th scope="col" className="py-2 pr-3 font-semibold">
                            Estado
                          </th>
                          <th scope="col" className="py-2 font-semibold">
                            Acción
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {group.rows.map((shipment) => (
                          <tr key={shipment.id} className="border-b border-neutral-200 align-top">
                            <td className="py-3 pr-3">
                              {shipment.flightNumber ?? "Sin número"}
                              {/* Carrier as secondary line: keeps the table
                                  inside the panel width without losing data. */}
                              <span className="block text-xs text-neutral-600">
                                {shipment.carrier ?? "Sin transportista"}
                              </span>
                            </td>
                            <td className="py-3 pr-3">
                              {formatEcuadorDateTime(shipment.orderCutoffAt)}
                            </td>
                            <td className="py-3 pr-3">
                              {formatEcuadorDateTime(shipment.departsAt)}
                            </td>
                            <td className="py-3 pr-3">
                              {formatEcuadorDateTime(shipment.estimatedArrivalAt)}
                            </td>
                            <td className="py-3 pr-3">
                              {formatEcuadorDateTime(shipment.pickupStartsAt)} –{" "}
                              {formatEcuadorDateTime(shipment.pickupEndsAt)}
                            </td>
                            <td className="py-3 pr-3">
                              <ShipmentStatusBadge status={shipment.status} />
                            </td>
                            <td className="py-3">
                              {shipment.status === "SCHEDULED" ? (
                                <form action={closeShipmentAction}>
                                  <input type="hidden" name="id" value={shipment.id} />
                                  <button type="submit" className={inlineButtonClass}>
                                    Cerrar
                                  </button>
                                </form>
                              ) : (
                                <span className="text-neutral-500">—</span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </AdminCard>
              </div>
            </section>
          ))}
        </div>
      )}

      <p className="mt-4 text-sm text-neutral-600">
        Se muestran hasta 50 vuelos. Todas las horas son de Ecuador
        (America/Guayaquil).
      </p>
    </div>
  );
}
