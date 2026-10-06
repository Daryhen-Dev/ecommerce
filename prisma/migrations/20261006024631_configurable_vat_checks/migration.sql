-- CHECK constraints for configurable VAT and locked order totals (T3b).
-- Appended as a follow-up migration so the applied configurable_vat DDL
-- migration is never edited after the fact.

-- tax_rate: append-only effective-dated VAT history.
ALTER TABLE "tax_rate" ADD CONSTRAINT "tax_rate_rate_bps_range_check" CHECK ("rate_bps" BETWEEN 0 AND 10000);

-- order_item: locked pricing snapshot must match the domain priceOrder line.
ALTER TABLE "order_item" ADD CONSTRAINT "order_item_vat_rate_bps_range_check" CHECK ("vat_rate_bps" BETWEEN 0 AND 10000);
ALTER TABLE "order_item" ADD CONSTRAINT "order_item_discount_bps_range_check" CHECK ("discount_bps" BETWEEN 0 AND 10000);
ALTER TABLE "order_item" ADD CONSTRAINT "order_item_gross_cents_nonnegative_check" CHECK ("gross_cents" >= 0);
ALTER TABLE "order_item" ADD CONSTRAINT "order_item_discount_cents_nonnegative_check" CHECK ("discount_cents" >= 0);
ALTER TABLE "order_item" ADD CONSTRAINT "order_item_vat_cents_nonnegative_check" CHECK ("vat_cents" >= 0);
ALTER TABLE "order_item" ADD CONSTRAINT "order_item_line_total_formula_check" CHECK ("line_total_cents" = "gross_cents" - "discount_cents" + "vat_cents");

-- orders: locked order totals (closes the T2 review follow-up).
ALTER TABLE "orders" ADD CONSTRAINT "orders_subtotal_cents_nonnegative_check" CHECK ("subtotal_cents" >= 0);
ALTER TABLE "orders" ADD CONSTRAINT "orders_discount_cents_nonnegative_check" CHECK ("discount_cents" >= 0);
ALTER TABLE "orders" ADD CONSTRAINT "orders_vat_cents_nonnegative_check" CHECK ("vat_cents" >= 0);
ALTER TABLE "orders" ADD CONSTRAINT "orders_total_cents_nonnegative_check" CHECK ("total_cents" >= 0);
ALTER TABLE "orders" ADD CONSTRAINT "orders_total_grams_positive_check" CHECK ("total_grams" > 0);
ALTER TABLE "orders" ADD CONSTRAINT "orders_total_formula_check" CHECK ("total_cents" = "subtotal_cents" - "discount_cents" + "vat_cents");
