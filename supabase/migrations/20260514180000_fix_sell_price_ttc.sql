-- ============================================================
-- Fix sell_price_ttc column: convert from generated column to
-- a plain numeric column so the app can insert values freely.
-- Also add return_conditions and return_excluded_products to app_settings.
-- ============================================================

-- 1. Drop the generated column and recreate as a plain column
DO $$
BEGIN
  -- Check if sell_price_ttc is a generated column
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'products'
      AND column_name = 'sell_price_ttc'
      AND is_generated = 'ALWAYS'
  ) THEN
    -- Drop the generated column
    ALTER TABLE public.products DROP COLUMN sell_price_ttc;
    -- Recreate as a plain numeric column
    ALTER TABLE public.products ADD COLUMN sell_price_ttc NUMERIC(10,2) DEFAULT 0;
  ELSE
    -- Already a plain column — just ensure default and nullability
    ALTER TABLE public.products
      ALTER COLUMN sell_price_ttc SET DEFAULT 0,
      ALTER COLUMN sell_price_ttc DROP NOT NULL;
  END IF;
END $$;

-- 2. Ensure sell_price_ht also has a safe default
ALTER TABLE public.products
  ALTER COLUMN sell_price_ht SET DEFAULT 0;

-- 3. Back-fill any rows where sell_price_ttc is NULL or 0
UPDATE public.products
SET sell_price_ttc = COALESCE(sell_price_ht, 0) * 1.085
WHERE sell_price_ttc IS NULL OR sell_price_ttc = 0;

-- 4. Add return_conditions text field to app_settings (for customisable receipt conditions)
ALTER TABLE public.app_settings
  ADD COLUMN IF NOT EXISTS return_conditions TEXT DEFAULT 'Retour accepté sous 30 jours selon conditions boutique. Produit non utilisé, non ouvert et en bon état. Ticket obligatoire pour tout retour ou échange.',
  ADD COLUMN IF NOT EXISTS return_excluded_products TEXT DEFAULT 'Certains produits peuvent être exclus du retour (produits d''hygiène, consommables ouverts).',
  ADD COLUMN IF NOT EXISTS receipt_seller_name TEXT DEFAULT '',
  ADD COLUMN IF NOT EXISTS receipt_cashier_label TEXT DEFAULT 'Caisse principale';
