import { cents, formatUsd } from "@/domain/money";
import { formatKilograms, grams } from "@/domain/weight";

import { formatPercentFromBps } from "@/lib/format";

import AvailabilityBadge from "./AvailabilityBadge";

import type { CatalogItem } from "@/server/catalog-mapping";

/**
 * One species card: description, price per kg, order minimum and step,
 * volume discount tiers and availability. Presentational only.
 */
export default function SpeciesCard({
  item,
  orderable,
}: {
  item: CatalogItem;
  orderable: boolean;
}) {
  const discountTiers = item.tiers.filter((tier) => tier.discountBps > 0);
  return (
    <article className="flex h-full flex-col gap-2 rounded-lg border border-neutral-200 bg-white p-5 shadow-sm">
      <h3 className="text-lg font-semibold">{item.name}</h3>
      {item.description !== null && (
        <p className="text-sm text-neutral-600">{item.description}</p>
      )}
      <p className="text-lg font-semibold">
        {formatUsd(cents(item.pricePerKgCents))}{" "}
        <span className="font-normal text-neutral-600">/ kg</span>
      </p>
      <p className="text-sm text-neutral-700">
        Pedido mínimo {formatKilograms(grams(item.minOrderGrams))} · en pasos de{" "}
        {formatKilograms(grams(item.orderStepGrams))}
      </p>
      {discountTiers.length > 0 ? (
        <ul className="text-sm text-neutral-700">
          {discountTiers.map((tier) => (
            <li key={tier.minTotalGrams}>
              Desde {formatKilograms(grams(tier.minTotalGrams))} en tu pedido:{" "}
              {formatPercentFromBps(tier.discountBps)} de descuento
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-neutral-700">Sin descuento por volumen</p>
      )}
      <div className="mt-auto flex flex-col items-start gap-2 pt-2">
        <AvailabilityBadge availability={item.availability} />
        {!orderable && (
          <p className="text-sm text-neutral-700">
            No pedible ahora: no hay vuelo abierto.
          </p>
        )}
      </div>
    </article>
  );
}
