"use client";

// Header link to the cart page of this city, with the number of distinct
// species lines. Renders without a count until mounted (SSR-safe), then
// keeps the count in sync through the useCart hook.

import Link from "next/link";

import { useCart } from "./useCart";

export default function CartLink({
  airportCode,
  shipmentId,
}: {
  airportCode: string;
  shipmentId: string;
}) {
  const { items } = useCart(shipmentId);
  const label = items === null ? "Carrito" : `Carrito (${items.length})`;
  return (
    <Link
      href={`/${airportCode.toLowerCase()}/carrito`}
      className="font-medium underline underline-offset-4 hover:text-neutral-600 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
    >
      {label}
    </Link>
  );
}
