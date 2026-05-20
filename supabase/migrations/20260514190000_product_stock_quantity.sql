-- Migration: Add quantity_available field support and ensure stock_movements_log exists
-- Products table: ensure stock column exists and has default 0
ALTER TABLE products ALTER COLUMN stock SET DEFAULT 0;

-- Ensure stock_movements_log table exists with all required columns
CREATE TABLE IF NOT EXISTS stock_movements_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID REFERENCES products(id) ON DELETE CASCADE,
  product_name TEXT NOT NULL DEFAULT '',
  movement_type TEXT NOT NULL DEFAULT 'entry',
  quantity_before NUMERIC NOT NULL DEFAULT 0,
  quantity_after NUMERIC NOT NULL DEFAULT 0,
  quantity_change NUMERIC NOT NULL DEFAULT 0,
  reason TEXT DEFAULT '',
  reference TEXT DEFAULT '',
  performed_by TEXT DEFAULT 'Admin',
  source TEXT DEFAULT 'manual',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add source column if not exists
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'stock_movements_log' AND column_name = 'source'
  ) THEN
    ALTER TABLE stock_movements_log ADD COLUMN source TEXT DEFAULT 'manual';
  END IF;
END $$;

-- Add user_id column if not exists
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'stock_movements_log' AND column_name = 'user_id'
  ) THEN
    ALTER TABLE stock_movements_log ADD COLUMN user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL;
  END IF;
END $$;

-- Index for fast product lookups
CREATE INDEX IF NOT EXISTS idx_stock_movements_product_id ON stock_movements_log(product_id);
CREATE INDEX IF NOT EXISTS idx_stock_movements_created_at ON stock_movements_log(created_at DESC);

-- RLS
ALTER TABLE stock_movements_log ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'stock_movements_log' AND policyname = 'Allow all for authenticated'
  ) THEN
    CREATE POLICY "Allow all for authenticated" ON stock_movements_log
      FOR ALL TO authenticated USING (true) WITH CHECK (true);
  END IF;
END $$;
