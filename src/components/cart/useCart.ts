"use client";

// Client cart hook: per-shipment cart in localStorage, synced across tabs
// through the `storage` event. SSR-safe via useSyncExternalStore: until the
// client hydrates, the server snapshot yields null items so no cart-specific
// markup is rendered before the real state is known.
//
// Storage is the source of truth: every mutation reads the current value,
// applies the pure reducer from @/lib/cart, writes it back and notifies the
// subscribers. Only slugs and grams are stored — never prices.

import { useCallback, useMemo, useSyncExternalStore } from "react";

import {
  addItem as addItemInState,
  cartStorageKey,
  emptyCart,
  parseStoredCart,
  removeItem as removeItemInState,
  setItemQuantity as setQuantityInState,
  shipmentIdFromKey,
  type CartState,
} from "@/lib/cart";

// localStorage writes only fire `storage` events in OTHER tabs, so our own
// writes notify subscribers explicitly.
const listeners = new Set<() => void>();

function emitChange(): void {
  for (const listener of listeners) {
    listener();
  }
}

/** Notifies every cart subscriber that localStorage changed outside the hook. */
export const notifyCartChanged = emitChange;

export function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  window.addEventListener("storage", listener);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", listener);
  };
}

/** Marker snapshot before hydration: no cart state is known yet. */
const UNMOUNTED: unique symbol = Symbol("cart-unmounted");

export interface UseCartResult {
  /** null before hydration; [] = empty cart. */
  items: { slug: string; grams: number }[] | null;
  addItem: (slug: string, grams: number) => void;
  setQuantity: (slug: string, grams: number) => void;
  removeItem: (slug: string) => void;
  clear: () => void;
}

export function useCart(shipmentId: string): UseCartResult {
  const raw = useSyncExternalStore<string | typeof UNMOUNTED>(
    subscribe,
    () => window.localStorage.getItem(cartStorageKey(shipmentId)) ?? "",
    () => UNMOUNTED,
  );

  const items = useMemo<{ slug: string; grams: number }[] | null>(
    () => (raw === UNMOUNTED ? null : parseStoredCart(raw)?.items ?? []),
    [raw],
  );

  const mutate = useCallback(
    (update: (state: CartState) => CartState) => {
      const current =
        parseStoredCart(window.localStorage.getItem(cartStorageKey(shipmentId))) ??
        emptyCart();
      const next = update(current);
      window.localStorage.setItem(cartStorageKey(shipmentId), JSON.stringify(next));
      emitChange();
    },
    [shipmentId],
  );

  const addItem = useCallback(
    (slug: string, grams: number) => mutate((state) => addItemInState(state, slug, grams)),
    [mutate],
  );

  const setQuantity = useCallback(
    (slug: string, grams: number) => mutate((state) => setQuantityInState(state, slug, grams)),
    [mutate],
  );

  const removeItem = useCallback(
    (slug: string) => mutate((state) => removeItemInState(state, slug)),
    [mutate],
  );

  const clear = useCallback(() => {
    window.localStorage.removeItem(cartStorageKey(shipmentId));
    emitChange();
  }, [shipmentId]);

  return { items, addItem, setQuantity, removeItem, clear };
}

/**
 * Keys of stale carts: cart keys whose shipment is neither the current one
 * nor another city's current (live) shipment, but that still hold items.
 * Their flight closed; the cart page offers to clear them.
 */
export function readStaleCartKeys(
  currentShipmentId: string,
  otherLiveShipmentIds: string[],
): string[] {
  const stale: string[] = [];
  const storage = window.localStorage;
  for (let index = 0; index < storage.length; index += 1) {
    const key = storage.key(index);
    if (key === null) continue;
    const keyShipmentId = shipmentIdFromKey(key);
    if (keyShipmentId === null || keyShipmentId === currentShipmentId) continue;
    if (otherLiveShipmentIds.includes(keyShipmentId)) continue;
    const stored = parseStoredCart(storage.getItem(key));
    if (stored !== null && stored.items.length > 0) {
      stale.push(key);
    }
  }
  return stale;
}
