"use client";

// Cart page view: shows the cart lines with a server-authoritative quote
// (re-quoted on every change through the quoteCart server action), per-line
// error messages, totals and the disabled payment step. Handles the empty
// state and stale carts saved for shipments that are no longer orderable.

import { useCallback, useEffect, useMemo, useState, useSyncExternalStore, type FormEvent } from "react";
import Link from "next/link";

import { formatUsd, cents } from "@/domain/money";
import { formatKilograms, grams } from "@/domain/weight";
import { formatPercentFromBps } from "@/lib/format";
import { validateQuantityInput } from "@/lib/cart";

import { quoteCart } from "@/server/cart";
import type {
  CartQuoteErrorLine,
  CartQuotePricedLine,
  CartQuoteResult,
} from "@/server/cart-quote";

import { useCart, subscribe, readStaleCartKeys, notifyCartChanged } from "./useCart";

/** Serializable catalog data the cart page needs per species. */
export interface CartCatalogItem {
  slug: string;
  name: string;
  pricePerKgCents: number;
  minOrderGrams: number;
  orderStepGrams: number;
  /** Stock left; null when the species is not AVAILABLE right now. */
  availableGrams: number | null;
}

export interface CartViewProps {
  airportCode: string;
  /** Current orderable shipment id; "" when no flight is open. */
  shipmentId: string;
  items: CartCatalogItem[];
  /** Current orderable shipment ids of the OTHER airports (their carts are live, not stale). */
  otherCityShipmentIds: string[];
}

type QuoteState =
  | { items: { slug: string; grams: number }[]; result: CartQuoteResult }
  | { items: { slug: string; grams: number }[]; failed: true };

/** Formatted USD from a plain cents number coming from the quote. */
function usd(centsValue: number): string {
  return formatUsd(cents(centsValue));
}

/** Kilogram number text for input values: 7500 -> "7.5". */
function kgNumberText(gramsValue: number): string {
  return formatKilograms(grams(gramsValue)).replace(/ kg$/, "");
}

/** Formatted kilograms that tolerates 0/null (used for issue messages). */
function safeKg(gramsValue: number | null): string {
  return gramsValue !== null && gramsValue > 0 ? formatKilograms(grams(gramsValue)) : "0 kg";
}

/** Spanish message for one line-level quote error. */
function errorMessage(
  errorLine: CartQuoteErrorLine,
  item: CartCatalogItem | undefined,
): string {
  switch (errorLine.error) {
    case "UNKNOWN_SPECIES":
      return "Este producto ya no existe en el catálogo. Quítalo de tu carrito.";
    case "OUT_OF_SEASON":
      return "Está fuera de temporada. Quítalo de tu carrito.";
    case "BELOW_MINIMUM":
      return `El pedido mínimo es ${safeKg(item?.minOrderGrams ?? null)}`;
    case "OFF_STEP":
      return `Debe ser en pasos de ${safeKg(item?.orderStepGrams ?? null)}`;
    case "INSUFFICIENT_AVAILABLE":
      return `Solo quedan ${safeKg(errorLine.availableGrams ?? item?.availableGrams ?? null)}`;
  }
}

function isPricedLine(
  line: CartQuotePricedLine | CartQuoteErrorLine,
): line is CartQuotePricedLine {
  return !("error" in line);
}

export default function CartView({
  airportCode,
  shipmentId,
  items,
  otherCityShipmentIds,
}: CartViewProps) {
  const cart = useCart(shipmentId);
  const [quoteState, setQuoteState] = useState<QuoteState | null>(null);
  const [rowErrors, setRowErrors] = useState<Record<string, string>>({});

  // Stale carts (carts of shipments that are no longer orderable anywhere)
  // read through the same external-store subscription as the cart itself.
  const getStaleSnapshot = useCallback(
    () => JSON.stringify(readStaleCartKeys(shipmentId, otherCityShipmentIds)),
    [shipmentId, otherCityShipmentIds],
  );
  const staleSnapshot = useSyncExternalStore(subscribe, getStaleSnapshot, () => "[]");
  const staleKeys = useMemo(() => JSON.parse(staleSnapshot) as string[], [staleSnapshot]);

  const cartItems = cart.items;

  // Authoritative server quote on every cart change. The result remembers
  // which cart version it belongs to; a newer cart version shows as loading.
  useEffect(() => {
    if (cartItems === null || cartItems.length === 0 || shipmentId === "") {
      return;
    }
    let cancelled = false;
    quoteCart(airportCode, shipmentId, cartItems)
      .then((result) => {
        if (!cancelled) setQuoteState({ items: cartItems, result });
      })
      .catch(() => {
        if (!cancelled) setQuoteState({ items: cartItems, failed: true });
      });
    return () => {
      cancelled = true;
    };
  }, [cartItems, airportCode, shipmentId]);

  function commitQuantity(slug: string, raw: string, item: CartCatalogItem) {
    const result = validateQuantityInput(raw, {
      minGrams: item.minOrderGrams,
      stepGrams: item.orderStepGrams,
      availableGrams: item.availableGrams ?? 0,
    });
    if (!result.ok) {
      setRowErrors((previous) => ({ ...previous, [slug]: result.message }));
      return;
    }
    setRowErrors((previous) => {
      const next = { ...previous };
      delete next[slug];
      return next;
    });
    cart.setQuantity(slug, result.grams);
  }

  function clearStaleCarts() {
    for (const key of staleKeys) {
      window.localStorage.removeItem(key);
    }
    notifyCartChanged();
  }

  function onClearClosedFlight() {
    cart.clear();
  }

  // --- branch: mounted? ---

  if (cartItems === null) {
    return <p className="mt-8 text-neutral-700">Cargando tu carrito…</p>;
  }

  const quoteLoading =
    cartItems.length > 0 &&
    shipmentId !== "" &&
    (quoteState === null || quoteState.items !== cartItems);
  const quoteResult =
    !quoteLoading && quoteState !== null && "result" in quoteState
      ? quoteState.result
      : null;
  const quoteFailed =
    !quoteLoading && quoteState !== null && "failed" in quoteState;
  const flightClosed =
    quoteResult !== null && !quoteResult.ok && quoteResult.orderError === "SHIPMENT_CLOSED";
  const showStaleEmptyCart = cartItems.length === 0 && staleKeys.length > 0;

  // --- branch: stale cart or closed flight ---

  if (flightClosed || showStaleEmptyCart) {
    return (
      <section aria-labelledby="stale-heading" className="mt-8">
        <h2 id="stale-heading" className="text-xl font-semibold">
          Tu carrito ya no es válido
        </h2>
        <p role="alert" className="mt-3 text-neutral-800">
          El vuelo de tu carrito ya cerró pedidos. Elige tu pedido para el
          próximo vuelo.
        </p>
        <div className="mt-4 flex items-center gap-4">
          <button
            type="button"
            onClick={flightClosed ? onClearClosedFlight : clearStaleCarts}
            className="rounded bg-neutral-900 px-4 py-2 font-medium text-white hover:bg-neutral-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
          >
            Vaciar carrito
          </button>
          <Link
            href={`/${airportCode}`}
            className="font-medium underline underline-offset-4 hover:text-neutral-600 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
          >
            Ver el próximo vuelo
          </Link>
        </div>
      </section>
    );
  }

  // --- branch: empty cart ---

  if (cartItems.length === 0) {
    return (
      <section aria-labelledby="empty-heading" className="mt-8">
        <h2 id="empty-heading" className="text-xl font-semibold">
          Tu carrito está vacío
        </h2>
        <p className="mt-2 text-neutral-700">
          Elige el pescado que quieres llevar desde el catálogo.
        </p>
        <Link
          href={`/${airportCode}`}
          className="mt-4 inline-block font-medium underline underline-offset-4 hover:text-neutral-600 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
        >
          Volver al catálogo
        </Link>
      </section>
    );
  }

  // --- branch: cart with lines ---

  const itemsBySlug = new Map(items.map((item) => [item.slug, item]));
  const pricedBySlug = new Map<string, CartQuotePricedLine>();
  const errorBySlug = new Map<string, CartQuoteErrorLine>();
  if (quoteResult !== null) {
    for (const line of quoteResult.lines) {
      if (isPricedLine(line)) {
        pricedBySlug.set(line.slug, line);
      } else {
        errorBySlug.set(line.slug, line);
      }
    }
  }
  const hasErrors = errorBySlug.size > 0;

  function onRowSubmit(event: FormEvent<HTMLFormElement>, slug: string, item: CartCatalogItem) {
    event.preventDefault();
    commitQuantity(slug, String(new FormData(event.currentTarget).get("quantity") ?? ""), item);
  }

  return (
    <div className="mt-8">
      {/* The quote table has 8 columns and cannot shrink to a phone width:
          it scrolls horizontally inside this labelled region instead of
          stretching the page. Focusable so keyboard users can scroll it. */}
      <div
        role="region"
        aria-label="Líneas de tu carrito"
        tabIndex={0}
        className="relative mt-4 overflow-x-auto rounded-lg focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
      >
      <table className="w-full min-w-max border-collapse text-sm">
        <caption className="sr-only">Líneas de tu carrito</caption>
        <thead>
          <tr className="border-b border-neutral-300 text-left">
            <th scope="col" className="py-2 pr-4">Especie</th>
            <th scope="col" className="py-2 pr-4">Cantidad</th>
            <th scope="col" className="py-2 pr-4">Precio por kg</th>
            <th scope="col" className="py-2 pr-4">Descuento</th>
            <th scope="col" className="py-2 pr-4">Subtotal sin IVA</th>
            <th scope="col" className="py-2 pr-4">IVA</th>
            <th scope="col" className="py-2 pr-4">Total</th>
            <th scope="col" className="py-2">
              <span className="sr-only">Acciones</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {cartItems.map((cartItem) => {
            const item = itemsBySlug.get(cartItem.slug);
            const name = item?.name ?? cartItem.slug;
            const quoteLine = pricedBySlug.get(cartItem.slug);
            const errorLine = errorBySlug.get(cartItem.slug);
            const rowError = rowErrors[cartItem.slug];
            const lineMessage =
              rowError ?? (errorLine !== undefined ? errorMessage(errorLine, item) : null);
            return (
              <tr key={cartItem.slug} className="border-b border-neutral-200">
                <th scope="row" className="py-3 pr-4 text-left font-medium">
                  {name}
                  <span className="sr-only">
                    Cantidad en el carrito: {formatKilograms(grams(cartItem.grams))}
                  </span>
                </th>
                <td className="py-3 pr-4">
                  <form
                    onSubmit={(event) => {
                      if (item !== undefined) onRowSubmit(event, cartItem.slug, item);
                    }}
                    className="flex items-center gap-1"
                  >
                    <label className="sr-only" htmlFor={`qty-${cartItem.slug}`}>
                      Cantidad de {name} en kg
                    </label>
                    <input
                      key={`${cartItem.slug}-${cartItem.grams}`}
                      id={`qty-${cartItem.slug}`}
                      name="quantity"
                      type="text"
                      inputMode="decimal"
                      autoComplete="off"
                      defaultValue={kgNumberText(cartItem.grams)}
                      aria-describedby={
                        lineMessage !== null ? `qty-error-${cartItem.slug}` : undefined
                      }
                      aria-invalid={rowError !== undefined || errorLine !== undefined ? true : undefined}
                      onBlur={(event) => {
                        if (item !== undefined) {
                          commitQuantity(cartItem.slug, event.target.value, item);
                        }
                      }}
                      className="w-20 rounded border border-neutral-300 px-2 py-1 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
                    />
                    <span aria-hidden="true">kg</span>
                  </form>
                  {lineMessage !== null && (
                    <p
                      id={`qty-error-${cartItem.slug}`}
                      aria-live="polite"
                      className="mt-1 max-w-xs text-red-800"
                    >
                      {lineMessage}
                    </p>
                  )}
                </td>
                <td className="py-3 pr-4">
                  {item !== undefined ? usd(item.pricePerKgCents) : "—"}
                </td>
                <td className="py-3 pr-4">
                  {quoteLine !== undefined ? formatPercentFromBps(quoteLine.discountBps) : "—"}
                </td>
                <td className="py-3 pr-4">
                  {quoteLine !== undefined
                    ? usd(quoteLine.grossCents - quoteLine.discountCents)
                    : "—"}
                </td>
                <td className="py-3 pr-4">
                  {quoteLine !== undefined ? usd(quoteLine.vatCents) : "—"}
                </td>
                <td className="py-3">
                  {quoteLine !== undefined ? usd(quoteLine.lineTotalCents) : "—"}
                </td>
                <td className="py-3 text-right">
                  <button
                    type="button"
                    aria-label={`Quitar ${name}`}
                    onClick={() => cart.removeItem(cartItem.slug)}
                    className="font-medium underline underline-offset-4 hover:text-neutral-600 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
                  >
                    Quitar
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      </div>

      {quoteLoading && (
        <p aria-live="polite" className="mt-4 text-neutral-700">
          Calculando totales…
        </p>
      )}
      {quoteFailed && (
        <p role="alert" className="mt-4 text-red-800">
          No se pudo calcular el total. Intenta de nuevo.
        </p>
      )}
      {hasErrors && (
        <p className="mt-4 text-neutral-800">
          Hay líneas que no se pueden pedir: quítalas o ajústalas para continuar.
        </p>
      )}

      {quoteResult !== null && quoteResult.ok && quoteResult.totals !== null && (
        <>
          <section
            aria-labelledby="totals-heading"
            aria-live="polite"
            className="mt-6 max-w-sm"
          >
            <h2 id="totals-heading" className="text-xl font-semibold">
              Totales
            </h2>
            <dl className="mt-3 space-y-1">
              <div className="flex justify-between">
                <dt>Subtotal</dt>
                <dd>{usd(quoteResult.totals.subtotalCents)}</dd>
              </div>
              <div className="flex justify-between">
                <dt>Descuento por volumen</dt>
                <dd>−{usd(quoteResult.totals.discountCents)}</dd>
              </div>
              <div className="flex justify-between">
                <dt>IVA</dt>
                <dd>{usd(quoteResult.totals.vatCents)}</dd>
              </div>
              <div className="flex justify-between border-t border-neutral-300 pt-1 font-semibold">
                <dt>Total</dt>
                <dd>{usd(quoteResult.totals.totalCents)}</dd>
              </div>
            </dl>
          </section>

          <div className="mt-8">
            <button
              type="button"
              disabled
              aria-disabled="true"
              aria-describedby="payment-note"
              className="rounded bg-neutral-300 px-6 py-2.5 font-semibold text-neutral-600"
            >
              Ir a pagar
            </button>
            <p id="payment-note" className="mt-2 text-sm text-neutral-600">
              El pago en línea estará disponible pronto.
            </p>
          </div>
        </>
      )}
    </div>
  );
}
