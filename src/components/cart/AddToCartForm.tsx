"use client";

// Add-to-cart form for one AVAILABLE species card. Client-side validation
// gives fast feedback; the server re-validates authoritatively when quoting
// the cart. Quantities already in the cart for this species count against
// the available grams.

import { useId, useRef, useState, type FormEvent } from "react";

import { formatKilograms, grams } from "@/domain/weight";
import { validateQuantityInput } from "@/lib/cart";

import { useCart } from "./useCart";

export interface AddToCartFormProps {
  slug: string;
  name: string;
  minOrderGrams: number;
  orderStepGrams: number;
  availableGrams: number;
  shipmentId: string;
}

export default function AddToCartForm({
  slug,
  name,
  minOrderGrams,
  orderStepGrams,
  availableGrams,
  shipmentId,
}: AddToCartFormProps) {
  const { addItem, items } = useCart(shipmentId);
  const [error, setError] = useState<string | null>(null);
  const [confirmation, setConfirmation] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const inputId = useId();
  const hintId = `${inputId}-hint`;
  const errorId = `${inputId}-error`;

  const inCart = items?.find((item) => item.slug === slug)?.grams ?? 0;
  const remaining = Math.max(availableGrams - inCart, 0);

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const raw = String(new FormData(event.currentTarget).get("quantity") ?? "");
    const result = validateQuantityInput(raw, {
      minGrams: minOrderGrams,
      stepGrams: orderStepGrams,
      availableGrams: remaining,
    });
    if (!result.ok) {
      setError(result.message);
      setConfirmation(null);
      return;
    }
    addItem(slug, result.grams);
    setError(null);
    setConfirmation(`Agregado: ${formatKilograms(grams(result.grams))} de ${name}`);
    event.currentTarget.reset();
    // Keep focus on the input for the next adjustment.
    inputRef.current?.focus();
  }

  return (
    <form onSubmit={onSubmit} className="w-full">
      <div className="flex items-end gap-2">
        <div>
          <label htmlFor={inputId} className="block text-sm font-medium text-neutral-800">
            Cantidad (kg)
          </label>
          <input
            ref={inputRef}
            id={inputId}
            name="quantity"
            type="text"
            inputMode="decimal"
            placeholder="1.5"
            autoComplete="off"
            aria-describedby={error !== null ? `${hintId} ${errorId}` : hintId}
            aria-invalid={error !== null ? true : undefined}
            className="mt-1 w-28 rounded border border-neutral-300 px-2 py-1 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
          />
          <p id={hintId} className="mt-1 text-xs text-neutral-600">
            Usa punto para decimales, ej. 7.5
          </p>
        </div>
        <button
          type="submit"
          className="rounded bg-neutral-900 px-3 py-1.5 font-medium text-white hover:bg-neutral-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
        >
          Agregar al carrito
        </button>
      </div>
      {error !== null && (
        <p id={errorId} role="alert" className="mt-1 text-sm text-red-800">
          {error}
        </p>
      )}
      <p role="status" className="mt-1 text-sm text-green-800">
        {confirmation}
      </p>
    </form>
  );
}
