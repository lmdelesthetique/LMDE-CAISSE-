-- Stock Module: Transit stock, enhanced movement history, stock actions
-- Timestamp: 20260512240000

-- 1. Add transit/reserved columns to products table
ALTER TABLE public.products
ADD COLUMN IF NOT EXISTS stock_reserved INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS stock_transit_container INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS stock_transit_avion INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS stock_damaged INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS stock_suspended INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS supplier_lead_days INTEGER DEFAULT 21,
ADD COLUMN IF NOT EXISTS sales_7d INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS sales_30d INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS is_suspended BOOLEAN DEFAULT false;

-- 2. Create stock_movements_log table for full history
CREATE TABLE IF NOT EXISTS public.stock_movements_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID REFERENCES public.products(id) ON DELETE CASCADE,
  product_name TEXT NOT NULL,
  movement_type TEXT NOT NULL CHECK (movement_type IN ('entry','exit','adjustment','reservation','cancellation','return','supplier_reception','damaged','suspended','transfer')),
  quantity_before INTEGER NOT NULL DEFAULT 0,
  quantity_after INTEGER NOT NULL DEFAULT 0,
  quantity_change INTEGER NOT NULL DEFAULT 0,
  reason TEXT,
  reference TEXT,
  performed_by TEXT NOT NULL DEFAULT 'Admin',
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_stock_movements_log_product_id ON public.stock_movements_log(product_id);
CREATE INDEX IF NOT EXISTS idx_stock_movements_log_created_at ON public.stock_movements_log(created_at DESC);

-- 3. RLS
ALTER TABLE public.stock_movements_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "stock_movements_log_open_access" ON public.stock_movements_log;
CREATE POLICY "stock_movements_log_open_access"
ON public.stock_movements_log FOR ALL TO public USING (true) WITH CHECK (true);

-- 4. Update products with realistic demo data
DO $$
BEGIN
  -- Update existing products with transit/sales data
  UPDATE public.products SET
    stock_reserved = FLOOR(RANDOM() * 3),
    stock_transit_container = CASE WHEN RANDOM() > 0.6 THEN FLOOR(RANDOM() * 50 + 10) ELSE 0 END,
    stock_transit_avion = CASE WHEN RANDOM() > 0.75 THEN FLOOR(RANDOM() * 20 + 5) ELSE 0 END,
    stock_damaged = CASE WHEN RANDOM() > 0.8 THEN FLOOR(RANDOM() * 3) ELSE 0 END,
    supplier_lead_days = FLOOR(RANDOM() * 30 + 7),
    sales_7d = FLOOR(RANDOM() * 15),
    sales_30d = FLOOR(RANDOM() * 50 + 5)
  WHERE id IS NOT NULL;

  -- Insert demo movement history
  INSERT INTO public.stock_movements_log (product_id, product_name, movement_type, quantity_before, quantity_after, quantity_change, reason, performed_by, created_at)
  SELECT
    p.id,
    p.name,
    'entry',
    0,
    p.stock,
    p.stock,
    'Réception fournisseur initiale',
    'Admin',
    NOW() - INTERVAL '30 days'
  FROM public.products p
  WHERE p.stock > 0
  LIMIT 8
  ON CONFLICT DO NOTHING;

  INSERT INTO public.stock_movements_log (product_id, product_name, movement_type, quantity_before, quantity_after, quantity_change, reason, performed_by, created_at)
  SELECT
    p.id,
    p.name,
    'exit',
    p.stock + 5,
    p.stock,
    -5,
    'Vente caisse',
    'Sophie F.',
    NOW() - INTERVAL '7 days'
  FROM public.products p
  WHERE p.stock > 0
  LIMIT 6
  ON CONFLICT DO NOTHING;

EXCEPTION
  WHEN OTHERS THEN
    RAISE NOTICE 'Demo data insertion skipped: %', SQLERRM;
END $$;
