import type { ShipmentSummary } from "@/server/catalog-mapping";

import { formatEcuadorDateTime } from "@/lib/format";

/**
 * Next orderable flight for the city, or an info box when no flight is open.
 * Presentational only: all data comes from the page via props.
 */
export default function FlightCard({
  city,
  shipment,
}: {
  city: string;
  shipment: ShipmentSummary | null;
}) {
  return (
    <section
      aria-labelledby="flight-heading"
      className="rounded-lg border border-neutral-200 bg-white p-6 shadow-sm"
    >
      <h2 id="flight-heading" className="text-xl font-semibold">
        Próximo vuelo a {city}
      </h2>
      {shipment === null ? (
        <p className="mt-3 rounded-md border border-sky-700 bg-sky-50 p-4 text-sky-950">
          Por ahora no hay vuelos abiertos a {city}. Vuelve pronto.
        </p>
      ) : (
        <dl className="mt-4 grid gap-x-8 gap-y-2 sm:grid-cols-[max-content_1fr]">
          <dt className="font-medium text-neutral-700">Vuelo</dt>
          <dd>
            <span className="font-semibold">{shipment.flightNumber}</span>
            {shipment.carrier !== null && (
              <span className="text-neutral-600"> · {shipment.carrier}</span>
            )}
          </dd>
          <dt className="font-medium text-neutral-700">Pedidos hasta</dt>
          <dd>{formatEcuadorDateTime(shipment.orderCutoffAt)}</dd>
          <dt className="font-medium text-neutral-700">Salida</dt>
          <dd>{formatEcuadorDateTime(shipment.departsAt)}</dd>
          <dt className="font-medium text-neutral-700">Llegada estimada</dt>
          <dd>{formatEcuadorDateTime(shipment.estimatedArrivalAt)}</dd>
          <dt className="font-medium text-neutral-700">
            Retiro en el aeropuerto
          </dt>
          <dd>
            {formatEcuadorDateTime(shipment.pickupStartsAt)} –{" "}
            {formatEcuadorDateTime(shipment.pickupEndsAt)}
          </dd>
        </dl>
      )}
    </section>
  );
}
