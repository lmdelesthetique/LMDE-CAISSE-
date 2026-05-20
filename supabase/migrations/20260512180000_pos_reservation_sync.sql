-- Migration: POS ↔ Reservation sync enhancements
-- Adds price_change_log table for audit trail of price modifications

-- 1. Price change audit log table
CREATE TABLE IF NOT EXISTS public.price_change_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id TEXT NOT NULL,
  product_name TEXT NOT NULL,
  old_price NUMERIC NOT NULL DEFAULT 0,
  new_price NUMERIC NOT NULL DEFAULT 0,
  reason TEXT,
  cashier_name TEXT,
  changed_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_price_change_log_product_id ON public.price_change_log(product_id);
CREATE INDEX IF NOT EXISTS idx_price_change_log_changed_at ON public.price_change_log(changed_at);

ALTER TABLE public.price_change_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "open_access_price_change_log" ON public.price_change_log;
CREATE POLICY "open_access_price_change_log" ON public.price_change_log
  FOR ALL TO public USING (true) WITH CHECK (true);

-- 2. Add pos_sale_id column to reservations for linking POS sales
ALTER TABLE public.reservations
  ADD COLUMN IF NOT EXISTS pos_sale_id TEXT;

-- 3. Ensure reservations has open RLS for the app (no auth required)
DROP POLICY IF EXISTS "open_access_reservations" ON public.reservations;
CREATE POLICY "open_access_reservations" ON public.reservations
  FOR ALL TO public USING (true) WITH CHECK (true);

-- 4. Ensure products table has open RLS
DROP POLICY IF EXISTS "open_access_products" ON public.products;
CREATE POLICY "open_access_products" ON public.products
  FOR ALL TO public USING (true) WITH CHECK (true);
