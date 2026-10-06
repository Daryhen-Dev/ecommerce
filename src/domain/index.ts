// Pure, framework-free business rules for the Galápagos fresh-fish shop.
// No Next.js, React, database, or other framework imports are allowed here.

export {
  cents,
  isCents,
  percentOf,
  formatUsd,
  type Cents,
} from "./money";

export {
  grams,
  isGrams,
  parseKilograms,
  formatKilograms,
  type Grams,
} from "./weight";

export {
  priceOrder,
  PricingError,
  type DiscountPolicy,
  type VatCategory,
  type DiscountTier,
  type PricingLineInput,
  type PricingInput,
  type PricedLine,
  type PricedOrder,
  type PricingErrorCode,
} from "./pricing";

export {
  resolveVatRates,
  TaxError,
  type TaxErrorCode,
  type DatedVatRate,
} from "./tax";

export {
  isSpeciesAvailable,
  findCurrentSeason,
  nextSeasonStart,
  SeasonError,
  type SeasonWindow,
  type SeasonErrorCode,
} from "./season";

export {
  parseShipmentWindow,
  canOrder,
  shipmentPhase,
  ShipmentError,
  type ShipmentWindow,
  type ShipmentPhase,
  type ShipmentErrorCode,
} from "./shipment";

export {
  canReserve,
  reserve,
  release,
  closeLot,
  availableGrams,
  canFulfillOrder,
  LotError,
  type LotState,
  type LotStatus,
  type LotErrorCode,
  type RejectionReason,
  type CanFulfillOrderOptions,
} from "./lot";
