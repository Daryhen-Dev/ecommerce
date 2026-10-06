/*
  Warnings:

  - You are about to drop the column `vat_rate_bps` on the `species` table. All the data in the column will be lost.
  - Added the required column `discount_cents` to the `order_item` table without a default value. This is not possible if the table is not empty.
  - Added the required column `gross_cents` to the `order_item` table without a default value. This is not possible if the table is not empty.
  - Added the required column `vat_cents` to the `order_item` table without a default value. This is not possible if the table is not empty.
  - Added the required column `vat_rate_bps` to the `order_item` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "vat_category" AS ENUM ('STANDARD', 'ZERO_RATED');

-- AlterTable
ALTER TABLE "order_item" ADD COLUMN     "discount_cents" INTEGER NOT NULL,
ADD COLUMN     "gross_cents" INTEGER NOT NULL,
ADD COLUMN     "vat_cents" INTEGER NOT NULL,
ADD COLUMN     "vat_rate_bps" INTEGER NOT NULL;

-- AlterTable
ALTER TABLE "species" DROP COLUMN "vat_rate_bps",
ADD COLUMN     "vat_category" "vat_category" NOT NULL DEFAULT 'STANDARD';

-- CreateTable
CREATE TABLE "tax_rate" (
    "id" TEXT NOT NULL,
    "category" "vat_category" NOT NULL,
    "rate_bps" INTEGER NOT NULL,
    "effective_from" TIMESTAMPTZ(6) NOT NULL,
    "note" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tax_rate_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "tax_rate_category_effective_from_key" ON "tax_rate"("category", "effective_from");
