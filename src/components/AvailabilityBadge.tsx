import type { SpeciesAvailability } from "@/server/catalog-mapping";

import { formatEcuadorDate } from "@/lib/format";
import { grams } from "@/domain/weight";
import { formatKilograms } from "@/domain/weight";

// Text is always present: the badge never relies on color alone.
const BADGE_STYLES: Record<SpeciesAvailability["state"], string> = {
  AVAILABLE: "border-green-700 bg-green-100 text-green-950",
  SOLD_OUT: "border-red-700 bg-red-100 text-red-950",
  OUT_OF_SEASON: "border-amber-700 bg-amber-100 text-amber-950",
};

/**
 * Availability text for one species. State and (when known) the next season
 * start are always written out, never conveyed by color only.
 */
export default function AvailabilityBadge({
  availability,
}: {
  availability: SpeciesAvailability;
}) {
  let text: string;
  switch (availability.state) {
    case "AVAILABLE":
      text = `Disponible: ${formatKilograms(grams(availability.availableGrams))}`;
      break;
    case "SOLD_OUT":
      text = "Agotado";
      break;
    case "OUT_OF_SEASON":
      text =
        availability.nextSeasonStart !== null
          ? `Fuera de temporada · Vuelve el ${formatEcuadorDate(availability.nextSeasonStart)}`
          : "Fuera de temporada";
      break;
  }
  return (
    <p
      className={`inline-block w-fit rounded border px-2 py-1 text-sm font-medium ${BADGE_STYLES[availability.state]}`}
    >
      {text}
    </p>
  );
}
