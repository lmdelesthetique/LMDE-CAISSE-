-- Supplier-Product Link + Product Status Enhancement
-- Timestamp: 20260512260000

-- 1. Add supplier FK and supplier-specific fields to products table
ALTER TABLE public.products
ADD COLUMN IF NOT EXISTS supplier_id UUID REFERENCES public.suppliers(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS supplier_id_secondary UUID REFERENCES public.suppliers(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS purchase_price_supplier NUMERIC DEFAULT 0,
ADD COLUMN IF NOT EXISTS min_order_qty INTEGER DEFAULT 1,
ADD COLUMN IF NOT EXISTS avg_restock_days INTEGER DEFAULT 21,
ADD COLUMN IF NOT EXISTS product_status TEXT DEFAULT 'active' CHECK (product_status IN ('active', 'rupture', 'en_commande', 'suspendu'));

-- 2. Create index for supplier-product lookups
CREATE INDEX IF NOT EXISTS idx_products_supplier_id ON public.products(supplier_id);
CREATE INDEX IF NOT EXISTS idx_products_product_status ON public.products(product_status);

-- 3. RLS already enabled on products — open policy already exists, no change needed

-- 4. Sync existing products: try to match supplier text name to suppliers table
DO $$
DECLARE
  sup RECORD;
BEGIN
  FOR sup IN SELECT id, company_name FROM public.suppliers LOOP
    UPDATE public.products
    SET supplier_id = sup.id,
        purchase_price_supplier = COALESCE(buy_price, 0),
        avg_restock_days = COALESCE(supplier_lead_days, 21)
    WHERE LOWER(supplier) = LOWER(sup.company_name)
      AND supplier_id IS NULL;
  END LOOP;
EXCEPTION
  WHEN OTHERS THEN
    RAISE NOTICE 'Supplier sync skipped: %', SQLERRM;
END $$;

-- 5. Sync product_status from is_suspended and stock
DO $$
BEGIN
  UPDATE public.products
  SET product_status = CASE
    WHEN is_suspended = true THEN 'suspendu'
    WHEN stock <= 0 THEN 'rupture'
    ELSE 'active'
  END
  WHERE product_status IS NULL OR product_status = 'active';
EXCEPTION
  WHEN OTHERS THEN
    RAISE NOTICE 'Product status sync skipped: %', SQLERRM;
END $$;
