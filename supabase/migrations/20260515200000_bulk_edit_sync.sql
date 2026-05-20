-- ============================================================
-- BULK EDIT HISTORY + CATEGORY/SUPPLIER SYNC — BeautyPOS
-- ============================================================

-- Bulk edit history table
CREATE TABLE IF NOT EXISTS public.bulk_edit_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  edited_by TEXT NOT NULL DEFAULT 'admin',
  edit_type TEXT NOT NULL, -- 'buy_price','sell_price_ttc','category','supplier','tva','min_stock','status','promo_price','transport','margin_pct'
  product_ids UUID[] NOT NULL,
  product_count INTEGER NOT NULL DEFAULT 0,
  old_values JSONB,
  new_value JSONB NOT NULL,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.bulk_edit_history ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='bulk_edit_history' AND policyname='bulk_edit_all') THEN
    CREATE POLICY bulk_edit_all ON public.bulk_edit_history FOR ALL USING (true) WITH CHECK (true);
  END IF;
END $$;

-- Ensure products table has supplier_id column
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS supplier_id UUID;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS category_id UUID REFERENCES public.categories(id) ON DELETE SET NULL;

-- Index for fast category/supplier lookups
CREATE INDEX IF NOT EXISTS idx_products_category_id ON public.products(category_id);
CREATE INDEX IF NOT EXISTS idx_products_supplier_id ON public.products(supplier_id);
CREATE INDEX IF NOT EXISTS idx_products_category_name ON public.products(category);

-- Function to auto-sync category name when category is renamed
CREATE OR REPLACE FUNCTION sync_product_category_name()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.name IS DISTINCT FROM NEW.name THEN
    UPDATE public.products SET category = NEW.name WHERE category = OLD.name;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_sync_category_name ON public.categories;
CREATE TRIGGER trg_sync_category_name
  AFTER UPDATE ON public.categories
  FOR EACH ROW EXECUTE FUNCTION sync_product_category_name();
