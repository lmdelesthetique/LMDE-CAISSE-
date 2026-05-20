-- ============================================================
-- Settings table + Enhanced returns (product condition, avoir status, losses)
-- ============================================================

-- 1. App settings table
CREATE TABLE IF NOT EXISTS public.app_settings (
  id TEXT PRIMARY KEY DEFAULT 'main',
  company_name TEXT DEFAULT 'LE MONDE DE L''ESTHETIQUE',
  legal_name TEXT DEFAULT 'LE MONDE DE L''ESTHETIQUE',
  siret TEXT DEFAULT '927 747 725',
  siren TEXT DEFAULT '927747725',
  tva_number TEXT DEFAULT 'FR71 927747 725',
  default_tva_rate NUMERIC(5,2) DEFAULT 8.5,
  address TEXT DEFAULT 'Baie des Flamands Appt 306 9 avenue Loulou Boislaville',
  city TEXT DEFAULT 'Fort-de-France',
  postal_code TEXT DEFAULT '97200',
  country TEXT DEFAULT 'France (Martinique)',
  phone TEXT DEFAULT '',
  email TEXT DEFAULT '',
  website TEXT DEFAULT '',
  logo_url TEXT DEFAULT '',
  currency TEXT DEFAULT 'EUR',
  timezone TEXT DEFAULT 'America/Martinique',
  language TEXT DEFAULT 'fr',
  default_structure_pct NUMERIC(5,2) DEFAULT 0,
  low_stock_alert_threshold INTEGER DEFAULT 5,
  auto_backup_enabled BOOLEAN DEFAULT true,
  backup_frequency TEXT DEFAULT 'daily',
  receipt_header TEXT DEFAULT '',
  receipt_footer TEXT DEFAULT 'Merci de votre visite !',
  receipt_show_logo BOOLEAN DEFAULT true,
  receipt_show_tva BOOLEAN DEFAULT true,
  receipt_show_barcode BOOLEAN DEFAULT false,
  receipt_show_points BOOLEAN DEFAULT true,
  receipt_paper_width TEXT DEFAULT '80mm',
  invoice_template TEXT DEFAULT 'standard',
  quote_template TEXT DEFAULT 'standard',
  label_width_mm NUMERIC(6,2) DEFAULT 50,
  label_height_mm NUMERIC(6,2) DEFAULT 30,
  label_font_size INTEGER DEFAULT 10,
  return_max_days INTEGER DEFAULT 30,
  return_require_receipt BOOLEAN DEFAULT false,
  loyalty_points_per_euro NUMERIC(5,2) DEFAULT 1,
  loyalty_euro_per_point NUMERIC(5,2) DEFAULT 0.01,
  payment_methods JSONB DEFAULT '[{"id":"cash","label":"Espèces","enabled":true},{"id":"card","label":"Carte bancaire","enabled":true},{"id":"check","label":"Chèque","enabled":true},{"id":"store_credit","label":"Avoir","enabled":true}]'::jsonb,
  printer_name TEXT DEFAULT '',
  printer_type TEXT DEFAULT 'thermal',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Insert default row if not exists
INSERT INTO public.app_settings (id) VALUES ('main') ON CONFLICT (id) DO NOTHING;

-- RLS
ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "app_settings_all" ON public.app_settings;
CREATE POLICY "app_settings_all" ON public.app_settings FOR ALL USING (true) WITH CHECK (true);

-- 2. Enhance returns table with new columns
ALTER TABLE public.returns
  ADD COLUMN IF NOT EXISTS product_condition TEXT DEFAULT 'good' CHECK (product_condition IN ('good', 'damaged', 'unknown')),
  ADD COLUMN IF NOT EXISTS return_to_stock BOOLEAN DEFAULT true,
  ADD COLUMN IF NOT EXISTS is_internal_loss BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS loss_amount NUMERIC(10,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS avoir_status TEXT DEFAULT 'available' CHECK (avoir_status IN ('available', 'partial', 'used', 'expired')),
  ADD COLUMN IF NOT EXISTS avoir_used_amount NUMERIC(10,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS avoir_expiry_date DATE DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS exchange_product_id UUID DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS exchange_product_name TEXT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS exchange_price_diff NUMERIC(10,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS decision TEXT DEFAULT NULL;

-- 3. Returns losses log table
CREATE TABLE IF NOT EXISTS public.return_losses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  return_id UUID REFERENCES public.returns(id) ON DELETE CASCADE,
  product_id UUID REFERENCES public.products(id) ON DELETE SET NULL,
  product_name TEXT NOT NULL,
  product_ref TEXT,
  quantity INTEGER NOT NULL DEFAULT 1,
  unit_cost NUMERIC(10,2) DEFAULT 0,
  total_loss NUMERIC(10,2) DEFAULT 0,
  loss_reason TEXT DEFAULT 'damaged',
  is_boutique_fault BOOLEAN DEFAULT false,
  recorded_by TEXT DEFAULT 'Admin',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.return_losses ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "return_losses_all" ON public.return_losses;
CREATE POLICY "return_losses_all" ON public.return_losses FOR ALL USING (true) WITH CHECK (true);

-- 4. Price change history table (for profitability sync)
CREATE TABLE IF NOT EXISTS public.product_price_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID REFERENCES public.products(id) ON DELETE CASCADE,
  product_ref TEXT,
  product_name TEXT,
  old_sell_price_ht NUMERIC(10,2),
  new_sell_price_ht NUMERIC(10,2),
  old_sell_price_ttc NUMERIC(10,2),
  new_sell_price_ttc NUMERIC(10,2),
  old_margin_pct NUMERIC(6,2),
  new_margin_pct NUMERIC(6,2),
  old_margin_amount NUMERIC(10,2),
  new_margin_amount NUMERIC(10,2),
  supplier_order_id UUID DEFAULT NULL,
  changed_by TEXT DEFAULT 'Admin',
  change_reason TEXT DEFAULT 'manual',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.product_price_history ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "product_price_history_all" ON public.product_price_history;
CREATE POLICY "product_price_history_all" ON public.product_price_history FOR ALL USING (true) WITH CHECK (true);

-- 5. Index for performance
CREATE INDEX IF NOT EXISTS idx_return_losses_return_id ON public.return_losses(return_id);
CREATE INDEX IF NOT EXISTS idx_product_price_history_product_id ON public.product_price_history(product_id);
CREATE INDEX IF NOT EXISTS idx_returns_avoir_status ON public.returns(avoir_status);
CREATE INDEX IF NOT EXISTS idx_returns_product_condition ON public.returns(product_condition);
