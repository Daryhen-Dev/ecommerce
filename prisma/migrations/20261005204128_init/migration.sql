-- CreateEnum
CREATE TYPE "discount_policy" AS ENUM ('GLOBAL', 'CUSTOM', 'NONE');

-- CreateEnum
CREATE TYPE "lot_status" AS ENUM ('OPEN', 'CLOSED');

-- CreateEnum
CREATE TYPE "shipment_status" AS ENUM ('SCHEDULED', 'CLOSED', 'IN_TRANSIT', 'ARRIVED', 'COMPLETED');

-- CreateEnum
CREATE TYPE "order_status" AS ENUM ('PENDING_PAYMENT', 'PAID', 'CANCELLED', 'PICKED_UP');

-- CreateTable
CREATE TABLE "airport" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "airport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "species" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "price_per_kg_cents" INTEGER NOT NULL,
    "discount_policy" "discount_policy" NOT NULL DEFAULT 'GLOBAL',
    "min_order_grams" INTEGER NOT NULL DEFAULT 1000,
    "order_step_grams" INTEGER NOT NULL DEFAULT 500,
    "vat_rate_bps" INTEGER NOT NULL DEFAULT 0,
    "is_seasonal" BOOLEAN NOT NULL DEFAULT false,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "species_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "season" (
    "id" TEXT NOT NULL,
    "species_id" TEXT NOT NULL,
    "starts_at" TIMESTAMPTZ(6) NOT NULL,
    "ends_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "season_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "discount_tier" (
    "id" TEXT NOT NULL,
    "species_id" TEXT,
    "min_total_grams" INTEGER NOT NULL,
    "discount_bps" INTEGER NOT NULL,

    CONSTRAINT "discount_tier_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lot" (
    "id" TEXT NOT NULL,
    "species_id" TEXT NOT NULL,
    "landed_at" TIMESTAMPTZ(6) NOT NULL,
    "total_grams" INTEGER NOT NULL,
    "reserved_grams" INTEGER NOT NULL DEFAULT 0,
    "status" "lot_status" NOT NULL DEFAULT 'OPEN',
    "notes" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "lot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "shipment" (
    "id" TEXT NOT NULL,
    "airport_id" TEXT NOT NULL,
    "carrier" TEXT,
    "flight_number" TEXT,
    "order_cutoff_at" TIMESTAMPTZ(6) NOT NULL,
    "departs_at" TIMESTAMPTZ(6) NOT NULL,
    "estimated_arrival_at" TIMESTAMPTZ(6) NOT NULL,
    "pickup_starts_at" TIMESTAMPTZ(6) NOT NULL,
    "pickup_ends_at" TIMESTAMPTZ(6) NOT NULL,
    "status" "shipment_status" NOT NULL DEFAULT 'SCHEDULED',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "shipment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "orders" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "shipment_id" TEXT NOT NULL,
    "customer_name" TEXT NOT NULL,
    "customer_email" TEXT NOT NULL,
    "customer_phone" TEXT NOT NULL,
    "customer_id_number" TEXT NOT NULL,
    "status" "order_status" NOT NULL DEFAULT 'PENDING_PAYMENT',
    "total_grams" INTEGER NOT NULL,
    "subtotal_cents" INTEGER NOT NULL,
    "discount_cents" INTEGER NOT NULL,
    "vat_cents" INTEGER NOT NULL,
    "total_cents" INTEGER NOT NULL,
    "paid_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "order_item" (
    "id" TEXT NOT NULL,
    "order_id" TEXT NOT NULL,
    "species_id" TEXT NOT NULL,
    "lot_id" TEXT NOT NULL,
    "grams" INTEGER NOT NULL,
    "price_per_kg_cents" INTEGER NOT NULL,
    "discount_bps" INTEGER NOT NULL,
    "line_total_cents" INTEGER NOT NULL,

    CONSTRAINT "order_item_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "airport_code_key" ON "airport"("code");

-- CreateIndex
CREATE UNIQUE INDEX "species_slug_key" ON "species"("slug");

-- CreateIndex
CREATE INDEX "season_species_id_starts_at_idx" ON "season"("species_id", "starts_at");

-- CreateIndex
CREATE UNIQUE INDEX "discount_tier_species_id_min_total_grams_key" ON "discount_tier"("species_id", "min_total_grams");

-- CreateIndex
CREATE INDEX "shipment_airport_id_departs_at_idx" ON "shipment"("airport_id", "departs_at");

-- CreateIndex
CREATE UNIQUE INDEX "orders_code_key" ON "orders"("code");

-- CreateIndex
CREATE INDEX "orders_shipment_id_status_idx" ON "orders"("shipment_id", "status");

-- CreateIndex
CREATE INDEX "order_item_lot_id_idx" ON "order_item"("lot_id");

-- AddForeignKey
ALTER TABLE "season" ADD CONSTRAINT "season_species_id_fkey" FOREIGN KEY ("species_id") REFERENCES "species"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "discount_tier" ADD CONSTRAINT "discount_tier_species_id_fkey" FOREIGN KEY ("species_id") REFERENCES "species"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lot" ADD CONSTRAINT "lot_species_id_fkey" FOREIGN KEY ("species_id") REFERENCES "species"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shipment" ADD CONSTRAINT "shipment_airport_id_fkey" FOREIGN KEY ("airport_id") REFERENCES "airport"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_shipment_id_fkey" FOREIGN KEY ("shipment_id") REFERENCES "shipment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_item" ADD CONSTRAINT "order_item_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_item" ADD CONSTRAINT "order_item_species_id_fkey" FOREIGN KEY ("species_id") REFERENCES "species"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_item" ADD CONSTRAINT "order_item_lot_id_fkey" FOREIGN KEY ("lot_id") REFERENCES "lot"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Global discount tiers (species_id IS NULL): Postgres treats NULLs as
-- distinct in the compound unique constraint above, so enforce uniqueness
-- of min_total_grams among global tiers with a partial unique index.
CREATE UNIQUE INDEX "discount_tier_global_min_total_grams_key" ON "discount_tier"("min_total_grams") WHERE "species_id" IS NULL;

-- CHECK constraints: database-level business invariants.

-- Lot: no overselling (reserved may never exceed the landed total).
ALTER TABLE "lot" ADD CONSTRAINT "lot_total_grams_positive_check" CHECK ("total_grams" > 0);
ALTER TABLE "lot" ADD CONSTRAINT "lot_reserved_grams_nonnegative_check" CHECK ("reserved_grams" >= 0);
ALTER TABLE "lot" ADD CONSTRAINT "lot_reserved_within_total_check" CHECK ("reserved_grams" <= "total_grams");

-- Species: non-negative pricing, positive order steps, valid VAT range.
ALTER TABLE "species" ADD CONSTRAINT "species_price_per_kg_cents_nonnegative_check" CHECK ("price_per_kg_cents" >= 0);
ALTER TABLE "species" ADD CONSTRAINT "species_min_order_grams_positive_check" CHECK ("min_order_grams" > 0);
ALTER TABLE "species" ADD CONSTRAINT "species_order_step_grams_positive_check" CHECK ("order_step_grams" > 0);
ALTER TABLE "species" ADD CONSTRAINT "species_vat_rate_bps_range_check" CHECK ("vat_rate_bps" BETWEEN 0 AND 10000);

-- Discount tier: valid ranges.
ALTER TABLE "discount_tier" ADD CONSTRAINT "discount_tier_min_total_grams_nonnegative_check" CHECK ("min_total_grams" >= 0);
ALTER TABLE "discount_tier" ADD CONSTRAINT "discount_tier_discount_bps_range_check" CHECK ("discount_bps" BETWEEN 0 AND 10000);

-- Season: windows must end after they start.
ALTER TABLE "season" ADD CONSTRAINT "season_ends_after_starts_check" CHECK ("ends_at" > "starts_at");

-- Shipment: ordering cutoff precedes departure; arrival follows departure;
-- pickup window is ordered.
ALTER TABLE "shipment" ADD CONSTRAINT "shipment_cutoff_before_departure_check" CHECK ("order_cutoff_at" <= "departs_at");
ALTER TABLE "shipment" ADD CONSTRAINT "shipment_arrival_after_departure_check" CHECK ("departs_at" < "estimated_arrival_at");
ALTER TABLE "shipment" ADD CONSTRAINT "shipment_pickup_window_ordered_check" CHECK ("pickup_starts_at" < "pickup_ends_at");

-- Order item: positive quantity, non-negative line total.
ALTER TABLE "order_item" ADD CONSTRAINT "order_item_grams_positive_check" CHECK ("grams" > 0);
ALTER TABLE "order_item" ADD CONSTRAINT "order_item_line_total_cents_nonnegative_check" CHECK ("line_total_cents" >= 0);
