-- ============================================================
-- Reservation Stock Integration
-- Adds stock column to products, stock deduction on reservation
-- ============================================================

-- 1. Add stock column to products table if not exists
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'products' AND column_name = 'stock'
  ) THEN
    ALTER TABLE public.products ADD COLUMN stock INTEGER NOT NULL DEFAULT 0;
  END IF;
END $$;

-- 2. Add product_id and image_url to reservation items (stored in JSONB, no schema change needed)
-- Items JSONB will now support: { name, qty, price, sku, product_id, image_url }

-- 3. Function: deduct stock when reservation is created
CREATE OR REPLACE FUNCTION public.deduct_stock_on_reservation(
  p_product_id UUID,
  p_qty INTEGER
)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  UPDATE public.products
  SET stock = GREATEST(0, stock - p_qty),
      updated_at = CURRENT_TIMESTAMP
  WHERE id = p_product_id;
END;
$$;

-- 4. Function: reinject stock when reservation is cancelled
CREATE OR REPLACE FUNCTION public.reinject_stock_on_cancel(
  p_product_id UUID,
  p_qty INTEGER
)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  UPDATE public.products
  SET stock = stock + p_qty,
      updated_at = CURRENT_TIMESTAMP
  WHERE id = p_product_id;
END;
$$;

-- 5. Seed some stock values for existing mock products (inventory_products already has data)
-- We'll add mock stock to products table for demo purposes
DO $$
BEGIN
  -- Only update if products table has rows with stock = 0
  UPDATE public.products SET stock = 14 WHERE ref = 'GEX-KIT-01' AND stock = 0;
  UPDATE public.products SET stock = 6  WHERE ref = 'LAMP-48W'   AND stock = 0;
  UPDATE public.products SET stock = 43 WHERE ref = 'STR-200'    AND stock = 0;
  UPDATE public.products SET stock = 2  WHERE ref = 'CIL-B-CURL' AND stock = 0;
  UPDATE public.products SET stock = 8  WHERE ref = 'SP-BOX-36'  AND stock = 0;
  UPDATE public.products SET stock = 3  WHERE ref = 'TAB-MAN-LUX' AND stock = 0;
  UPDATE public.products SET stock = 19 WHERE ref = 'BROW-KIT-10' AND stock = 0;
  UPDATE public.products SET stock = 22 WHERE ref = 'ACR-RN-500'  AND stock = 0;
  UPDATE public.products SET stock = 7  WHERE ref = 'KIT-DEB-ONG' AND stock = 0;
  UPDATE public.products SET stock = 11 WHERE ref = 'FRAISE-35K'  AND stock = 0;
  UPDATE public.products SET stock = 38 WHERE ref = 'TC-GEL-15'   AND stock = 0;
  UPDATE public.products SET stock = 55 WHERE ref = 'COL-GX-7G'   AND stock = 0;
  UPDATE public.products SET stock = 0  WHERE ref = 'GLITTER-MIX' AND stock = 0;
  UPDATE public.products SET stock = 0  WHERE ref = 'CHAIR-PRO-WH' AND stock = 0;
EXCEPTION
  WHEN OTHERS THEN
    RAISE NOTICE 'Stock seed skipped: %', SQLERRM;
END $$;
