-- Migration: Add 'sale' movement type support and barcode column to products
-- Ensure stock_movements_log accepts 'sale' as movement_type (no constraint to change, TEXT column is open)

-- Add barcode column to products if not exists (for camera scan lookup)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'products' AND column_name = 'barcode'
  ) THEN
    ALTER TABLE products ADD COLUMN barcode TEXT DEFAULT NULL;
  END IF;
END $$;

-- Index for fast barcode lookups in POS
CREATE INDEX IF NOT EXISTS idx_products_barcode ON products(barcode) WHERE barcode IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_products_ref ON products(ref);

-- Add payment_method column to stock_movements_log for sale traceability
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'stock_movements_log' AND column_name = 'payment_method'
  ) THEN
    ALTER TABLE stock_movements_log ADD COLUMN payment_method TEXT DEFAULT NULL;
  END IF;
END $$;

-- Ensure RLS policy exists for stock_movements_log
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'stock_movements_log' AND policyname = 'Allow all for authenticated'
  ) THEN
    CREATE POLICY "Allow all for authenticated" ON stock_movements_log
      FOR ALL TO authenticated USING (true) WITH CHECK (true);
  END IF;
END $$;

-- Ensure products RLS allows updates (for stock deduction)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'products' AND policyname = 'Allow all for authenticated'
  ) THEN
    CREATE POLICY "Allow all for authenticated" ON products
      FOR ALL TO authenticated USING (true) WITH CHECK (true);
  END IF;
END $$;
