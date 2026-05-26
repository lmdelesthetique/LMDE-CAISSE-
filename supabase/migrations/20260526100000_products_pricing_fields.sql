-- Add gross_margin, margin_rate, description, location to products table
-- These are needed for complete import/export and margin reporting

ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS gross_margin   NUMERIC(12,4) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS margin_rate    NUMERIC(8,4)  DEFAULT 0,
  ADD COLUMN IF NOT EXISTS description    TEXT          DEFAULT '',
  ADD COLUMN IF NOT EXISTS location       TEXT          DEFAULT '';

-- Backfill gross_margin and margin_rate for existing products
-- gross_margin = sell_price_ht - buy_price
-- margin_rate  = (gross_margin / buy_price) * 100
UPDATE public.products
SET
  gross_margin = ROUND(
    COALESCE(sell_price_ht, sell_price_ttc / 1.085, 0) - COALESCE(buy_price, 0),
    4
  ),
  margin_rate = CASE
    WHEN COALESCE(buy_price, 0) > 0
    THEN ROUND(
      (COALESCE(sell_price_ht, sell_price_ttc / 1.085, 0) - COALESCE(buy_price, 0))
      / COALESCE(buy_price, 1) * 100,
      4
    )
    ELSE 0
  END
WHERE gross_margin = 0 OR gross_margin IS NULL;

-- Index for location-based queries
CREATE INDEX IF NOT EXISTS idx_products_location ON public.products(location)
  WHERE location IS NOT NULL AND location <> '';
