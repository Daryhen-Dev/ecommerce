// Orders (pedidos) of one flight for the panel (A6): pick a shipment and see
// its orders newest first, each with its pickup code, customer, locked lines and
// locked totals, plus the two manual status transitions.
//
// The default shipment is the newest departure that already carries orders, so
// the section is never empty while there is something to see; `?shipment=<id>`
// chooses another one. Everything is read-only except the status: the amounts
// shown are the ones stored on the order, never recomputed from today's prices.
//
// Dynamic on purpose: the panel always reads the current operation state.

import type { Metadata } from "next";
import Link from "next/link";

import { transitionOrder } from "@/app/admin/(panel)/orders/actions";
import OrderTransitionForm from "@/app/admin/(panel)/orders/OrderTransitionForm";
import AdminCard from "@/components/admin/AdminCard";
import { inputClass, inlineButtonClass } from "@/components/admin/form-styles";
import { formatEcuadorDateTime } from "@/lib/format";
import { formatWeightLabel } from "@/lib/admin-lots";
import {
  orderStatusLabel,
  pickDefaultShipmentId,
  type OrderStatus,
} from "@/lib/admin-orders";
import { cents, formatUsd } from "@/domain/money";
import {
  listOrdersForShipment,
  listShipmentsForOrderSelector,
  type AdminOrderRow,
  type AdminShipmentOption,
} from "@/server/admin-orders";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Pedidos | Pesca Artesanal Galápagos",
};

type OrdersPageProps = {
  searchParams: Promise<{ shipment?: string }>;
};

/** Text badge: the status is always written, never color-only. */
function OrderStatusBadge({ status }: { status: OrderStatus }) {
  const tone =
    status === "PAID"
      ? "border-green-700 bg-green-100 text-green-950"
      : status === "PENDING_PAYMENT"
        ? "border-amber-700 bg-amber-100 text-amber-950"
        : "border-neutral-500 bg-neutral-100 text-neutral-800";
  return (
    <span
      className={`inline-block rounded border px-2 py-0.5 text-xs font-medium ${tone}`}
    >
      {orderStatusLabel(status)}
    </span>
  );
}

/** Money label of one stored integer amount of cents. */
function usd(amountCents: number): string {
  return formatUsd(cents(amountCents));
}

/** Option text of one shipment in the selector. */
function shipmentOptionLabel(shipment: AdminShipmentOption): string {
  const flight = shipment.flightNumber ?? "Vuelo sin número";
  return `${flight} — ${shipment.airportCode} · ${formatEcuadorDateTime(shipment.departsAt)}`;
}

/** Read-only explanation shown instead of the buttons on a settled order. */
function settledNote(status: OrderStatus): string {
  if (status === "PAID") {
    return "Pagado: desde el panel ya no se puede cancelar ni editar. Un reembolso se gestiona fuera del panel.";
  }
  if (status === "CANCELLED") {
    return "Cancelado: el pedido no admite más cambios de estado.";
  }
  return "Retirado: el pedido no admite más cambios de estado.";
}

/** One order: pickup code, customer, locked lines, locked totals and actions. */
function OrderCard({ order }: { order: AdminOrderRow }) {
  const codeId = `order-${order.id}-code`;

  return (
    <article
      aria-labelledby={codeId}
      className="rounded-lg border border-neutral-300 bg-white p-5"
    >
      <header className="flex flex-wrap items-start justify-between gap-3 border-b border-neutral-200 pb-3">
        <div>
          <p className="text-xs font-medium tracking-wide text-neutral-600 uppercase">
            Código de retiro
          </p>
          <p
            id={codeId}
            className="font-mono text-2xl font-bold tracking-wide break-all"
          >
            {order.code}
          </p>
        </div>
        <div className="flex flex-col items-start gap-1 sm:items-end">
          <OrderStatusBadge status={order.status} />
          <p className="text-xs text-neutral-600">
            Pedido el {formatEcuadorDateTime(order.createdAt)}
          </p>
          {order.paidAt === null ? null : (
            <p className="text-xs text-neutral-600">
              Pagado el {formatEcuadorDateTime(order.paidAt)}
            </p>
          )}
        </div>
      </header>

      <dl className="mt-3 grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
        <div className="flex gap-2">
          <dt className="font-medium">Cliente</dt>
          <dd>{order.customerName}</dd>
        </div>
        <div className="flex gap-2">
          <dt className="font-medium">Teléfono</dt>
          <dd>{order.customerPhone}</dd>
        </div>
        <div className="flex gap-2">
          <dt className="font-medium">Correo</dt>
          <dd className="break-all">{order.customerEmail}</dd>
        </div>
        <div className="flex gap-2">
          <dt className="font-medium">Cédula</dt>
          <dd>{order.customerIdNumber}</dd>
        </div>
      </dl>

      <div className="mt-4 overflow-x-auto">
        <table className="w-full min-w-[34rem] border-collapse text-left text-sm">
          <caption className="sr-only">
            Ítems del pedido {order.code}, con los valores guardados al
            registrarlo.
          </caption>
          <thead>
            <tr className="border-b border-neutral-300">
              <th scope="col" className="py-2 pr-3 font-semibold">
                Especie
              </th>
              <th scope="col" className="py-2 pr-3 font-semibold">
                Kilos
              </th>
              <th scope="col" className="py-2 pr-3 font-semibold">
                Precio por kilo
              </th>
              <th scope="col" className="py-2 font-semibold">
                Total de la línea
              </th>
            </tr>
          </thead>
          <tbody>
            {order.items.map((item) => (
              <tr key={item.id} className="border-b border-neutral-200">
                <td className="py-2 pr-3">{item.speciesName}</td>
                <td className="py-2 pr-3">{formatWeightLabel(item.grams)}</td>
                <td className="py-2 pr-3">{usd(item.pricePerKgCents)}</td>
                <td className="py-2">{usd(item.lineTotalCents)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <dl className="mt-4 ml-auto grid w-full max-w-sm gap-1 text-sm sm:grid-cols-2">
        <dt className="sm:col-span-1">Subtotal</dt>
        <dd className="sm:text-right">{usd(order.subtotalCents)}</dd>
        <dt className="sm:col-span-1">Descuento</dt>
        <dd className="sm:text-right">{usd(order.discountCents)}</dd>
        <dt className="sm:col-span-1">IVA</dt>
        <dd className="sm:text-right">{usd(order.vatCents)}</dd>
        <dt className="border-t border-neutral-300 pt-1 font-semibold sm:col-span-1">
          Total
        </dt>
        <dd className="border-t border-neutral-300 pt-1 font-semibold sm:text-right">
          {usd(order.totalCents)}
        </dd>
        <dt className="sm:col-span-1">Peso total</dt>
        <dd className="sm:text-right">{formatWeightLabel(order.totalGrams)}</dd>
      </dl>

      {order.status === "PENDING_PAYMENT" ? (
        <OrderTransitionForm
          action={transitionOrder}
          orderId={order.id}
          currentStatus={order.status}
        />
      ) : (
        <p className="mt-4 text-sm text-neutral-700">{settledNote(order.status)}</p>
      )}
    </article>
  );
}

export default async function AdminOrdersPage({ searchParams }: OrdersPageProps) {
  const { shipment } = await searchParams;
  const requestedId =
    typeof shipment === "string" && shipment !== "" ? shipment : undefined;

  const shipments = await listShipmentsForOrderSelector();
  // An unknown `?shipment=` falls back to the default instead of rendering an
  // empty page: a stale bookmark still lands on something readable.
  const selectedId =
    requestedId !== undefined &&
    shipments.some((row) => row.id === requestedId)
      ? requestedId
      : pickDefaultShipmentId(shipments);
  const selected =
    shipments.find((row) => row.id === selectedId) ?? null;

  const orders = selected === null ? [] : await listOrdersForShipment(selected.id);

  return (
    <div>
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h1 className="text-3xl font-bold sm:text-4xl">Pedidos</h1>
        <Link href="/admin" className="font-medium underline underline-offset-4">
          Panel
        </Link>
      </div>
      <p className="mt-3 max-w-2xl text-neutral-700">
        Cada pedido guarda el código de retiro que el cliente presenta en el
        aeropuerto, sus ítems y sus montos tal como quedaron al registrarse.
        Cambiar un precio en la tienda no reescribe un pedido ya hecho: aquí solo
        se confirma el pago o se cancela.
      </p>

      {shipments.length === 0 ? (
        <div className="mt-6">
          <AdminCard>
            <p className="text-neutral-700">
              Todavía no hay vuelos programados.{" "}
              <Link
                href="/admin/shipments/new"
                className="font-medium underline underline-offset-4"
              >
                Programa un vuelo
              </Link>{" "}
              para recibir pedidos.
            </p>
          </AdminCard>
        </div>
      ) : (
        <>
          <form method="get" className="mt-6 flex flex-wrap items-end gap-2">
            <div className="flex flex-col gap-1">
              <label htmlFor="shipment" className="text-sm font-medium">
                Vuelo
              </label>
              <select
                id="shipment"
                name="shipment"
                defaultValue={selected?.id ?? ""}
                className={`${inputClass} w-full sm:w-[34rem]`}
              >
                {shipments.map((row) => (
                  <option key={row.id} value={row.id}>
                    {shipmentOptionLabel(row)}
                  </option>
                ))}
              </select>
            </div>
            <button type="submit" className={inlineButtonClass}>
              Ver pedidos
            </button>
          </form>

          {selected === null ? null : (
            <div className="mt-6">
              <AdminCard title={`Vuelo ${selected.flightNumber ?? "sin número"}`}>
                <p className="text-sm text-neutral-700">
                  {selected.airportCity} ({selected.airportCode}) · sale el{" "}
                  {formatEcuadorDateTime(selected.departsAt)} ·{" "}
                  {selected.orderCount === 1
                    ? "1 pedido"
                    : `${selected.orderCount} pedidos`}
                </p>
              </AdminCard>
            </div>
          )}

          <div className="mt-4 flex flex-col gap-4">
            {orders.length === 0 ? (
              <AdminCard>
                <p className="text-neutral-700">
                  Este vuelo no tiene pedidos todavía.
                </p>
              </AdminCard>
            ) : (
              orders.map((order) => <OrderCard key={order.id} order={order} />)
            )}
          </div>

          <p className="mt-4 text-sm text-neutral-600">
            Se muestran los últimos 50 pedidos del vuelo, del más reciente al
            más antiguo. Los montos están en dólares y no se recalculan.
          </p>
        </>
      )}
    </div>
  );
}
