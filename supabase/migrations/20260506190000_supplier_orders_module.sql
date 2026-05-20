-- ============================================================
-- SUPPLIER ORDERS MODULE — BeautyPOS
-- Extended order management, costs, reception, margins
-- ============================================================

-- 1. EXTENDED ENUM TYPES

DROP TYPE IF EXISTS public.fo_order_status CASCADE;
CREATE TYPE public.fo_order_status AS ENUM (
  'draft',
  'sent',
  'awaiting_validation',
  'validated',
  'modification_requested',
  'payment_pending',
  'payment_in_progress',
  'paid',
  'payment_received_by_supplier',
  'in_preparation',
  'in_production',
  'ready_to_ship',
  'shipped',
  'partially_received',
  'fully_received',
  'costs_recorded',
  'stock_integrated',
  'closed',
  'suspended',
  'cancelled'
);

DROP TYPE IF EXISTS public.fo_payment_status CASCADE;
CREATE TYPE public.fo_payment_status AS ENUM (
  'pending',
  'in_progress',
  'paid',
  'received_by_supplier',
  'partial',
  'balance_due',
  'partially_refunded',
  'fully_refunded'
);

DROP TYPE IF EXISTS public.fo_cost_method CASCADE;
CREATE TYPE public.fo_cost_method AS ENUM (
  'by_value',
  'by_quantity',
  'by_weight',
  'by_volume',
  'custom'
);

DROP TYPE IF EXISTS public.fo_restock_status CASCADE;
CREATE TYPE public.fo_restock_status AS ENUM (
  'suggested',
  'ordered',
  'ignored',
  'suspended'
);

DROP TYPE IF EXISTS public.fo_suspension_reason CASCADE;
CREATE TYPE public.fo_suspension_reason AS ENUM (
  'bad_customer_feedback',
  'not_profitable',
  'slow_seller',
  'unreliable_supplier',
  'range_change',
  'replaced_by_other',
  'permanent_stop',
  'other'
);

-- 2. SUPPLIER PURCHASE ORDERS (extended)

CREATE TABLE IF NOT EXISTS public.fo_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier_id UUID REFERENCES public.suppliers(id) ON DELETE SET NULL,
  order_number TEXT NOT NULL,
  order_status public.fo_order_status DEFAULT 'draft',
  currency TEXT DEFAULT 'EUR',
  exchange_rate NUMERIC(12,6) DEFAULT 1,
  notes TEXT,
  internal_notes TEXT,
  tracking_number TEXT,
  expected_delivery_at DATE,
  shipped_at TIMESTAMPTZ,
  received_at TIMESTAMPTZ,
  -- Costs
  subtotal NUMERIC(14,2) DEFAULT 0,
  transport_cost NUMERIC(14,2) DEFAULT 0,
  customs_cost NUMERIC(14,2) DEFAULT 0,
  vat_import NUMERIC(14,2) DEFAULT 0,
  freight_forwarder_cost NUMERIC(14,2) DEFAULT 0,
  bank_fees NUMERIC(14,2) DEFAULT 0,
  exchange_fees NUMERIC(14,2) DEFAULT 0,
  local_delivery NUMERIC(14,2) DEFAULT 0,
  other_costs NUMERIC(14,2) DEFAULT 0,
  total_real_cost NUMERIC(14,2) DEFAULT 0,
  cost_method public.fo_cost_method DEFAULT 'by_value',
  costs_validated BOOLEAN DEFAULT false,
  stock_integrated BOOLEAN DEFAULT false,
  -- Payment
  payment_status public.fo_payment_status DEFAULT 'pending',
  payment_method TEXT,
  payment_amount NUMERIC(14,2),
  payment_date DATE,
  payment_proof_url TEXT,
  balance_due NUMERIC(14,2) DEFAULT 0,
  -- Supplier response
  supplier_validated BOOLEAN DEFAULT false,
  supplier_comment TEXT,
  supplier_final_amount NUMERIC(14,2),
  -- Metadata
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- 3. ORDER LINE ITEMS

CREATE TABLE IF NOT EXISTS public.fo_order_lines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES public.fo_orders(id) ON DELETE CASCADE,
  product_id UUID,
  product_name TEXT NOT NULL,
  product_ref TEXT,
  product_image_url TEXT,
  variant TEXT,
  color TEXT,
  size TEXT,
  model TEXT,
  qty_ordered INTEGER NOT NULL DEFAULT 1,
  qty_received INTEGER DEFAULT 0,
  unit_price NUMERIC(14,4) DEFAULT 0,
  line_total NUMERIC(14,2) DEFAULT 0,
  -- Cost breakdown per unit
  unit_transport NUMERIC(14,4) DEFAULT 0,
  unit_customs NUMERIC(14,4) DEFAULT 0,
  unit_vat_import NUMERIC(14,4) DEFAULT 0,
  unit_freight NUMERIC(14,4) DEFAULT 0,
  unit_other NUMERIC(14,4) DEFAULT 0,
  unit_real_cost NUMERIC(14,4) DEFAULT 0,
  -- Margin
  sale_price NUMERIC(14,4) DEFAULT 0,
  gross_margin NUMERIC(14,4) DEFAULT 0,
  margin_rate NUMERIC(8,4) DEFAULT 0,
  -- Previous cost
  previous_cost NUMERIC(14,4) DEFAULT 0,
  -- Reception
  qty_missing INTEGER DEFAULT 0,
  qty_damaged INTEGER DEFAULT 0,
  reception_note TEXT,
  -- Weight/volume for cost distribution
  weight_kg NUMERIC(10,4) DEFAULT 0,
  volume_m3 NUMERIC(10,6) DEFAULT 0,
  custom_cost_share NUMERIC(14,4) DEFAULT 0,
  note TEXT,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- 4. ORDER STATUS HISTORY

CREATE TABLE IF NOT EXISTS public.fo_order_status_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES public.fo_orders(id) ON DELETE CASCADE,
  old_status public.fo_order_status,
  new_status public.fo_order_status NOT NULL,
  changed_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  changed_by TEXT DEFAULT 'system',
  comment TEXT
);

-- 5. ORDER DOCUMENTS

CREATE TABLE IF NOT EXISTS public.fo_order_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES public.fo_orders(id) ON DELETE CASCADE,
  doc_type TEXT NOT NULL,
  label TEXT,
  file_url TEXT NOT NULL,
  uploaded_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- 6. PRODUCT COST HISTORY

CREATE TABLE IF NOT EXISTS public.fo_product_cost_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID,
  product_name TEXT NOT NULL,
  product_ref TEXT,
  supplier_id UUID REFERENCES public.suppliers(id) ON DELETE SET NULL,
  order_id UUID REFERENCES public.fo_orders(id) ON DELETE SET NULL,
  old_purchase_price NUMERIC(14,4) DEFAULT 0,
  new_purchase_price NUMERIC(14,4) DEFAULT 0,
  old_real_cost NUMERIC(14,4) DEFAULT 0,
  new_real_cost NUMERIC(14,4) DEFAULT 0,
  associated_fees NUMERIC(14,2) DEFAULT 0,
  reason TEXT DEFAULT 'reception_with_real_costs',
  validated_by TEXT DEFAULT 'system',
  changed_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- 7. RESTOCK SUGGESTIONS

CREATE TABLE IF NOT EXISTS public.fo_restock_suggestions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID,
  product_name TEXT NOT NULL,
  product_ref TEXT,
  product_image_url TEXT,
  supplier_id UUID REFERENCES public.suppliers(id) ON DELETE SET NULL,
  current_stock INTEGER DEFAULT 0,
  min_stock INTEGER DEFAULT 0,
  suggested_qty INTEGER DEFAULT 0,
  last_purchase_price NUMERIC(14,4) DEFAULT 0,
  last_real_cost NUMERIC(14,4) DEFAULT 0,
  recent_sales INTEGER DEFAULT 0,
  restock_status public.fo_restock_status DEFAULT 'suggested',
  suspension_reason public.fo_suspension_reason,
  suspension_note TEXT,
  suspended_at TIMESTAMPTZ,
  last_updated TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- 8. INDEXES

CREATE INDEX IF NOT EXISTS idx_fo_orders_supplier ON public.fo_orders(supplier_id);
CREATE INDEX IF NOT EXISTS idx_fo_orders_status ON public.fo_orders(order_status);
CREATE INDEX IF NOT EXISTS idx_fo_orders_created ON public.fo_orders(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_fo_order_lines_order ON public.fo_order_lines(order_id);
CREATE INDEX IF NOT EXISTS idx_fo_order_lines_product ON public.fo_order_lines(product_id);
CREATE INDEX IF NOT EXISTS idx_fo_status_history_order ON public.fo_order_status_history(order_id);
CREATE INDEX IF NOT EXISTS idx_fo_cost_history_product ON public.fo_product_cost_history(product_id);
CREATE INDEX IF NOT EXISTS idx_fo_restock_supplier ON public.fo_restock_suggestions(supplier_id);
CREATE INDEX IF NOT EXISTS idx_fo_restock_status ON public.fo_restock_suggestions(restock_status);

-- 9. RLS

ALTER TABLE public.fo_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fo_order_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fo_order_status_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fo_order_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fo_product_cost_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fo_restock_suggestions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "open_fo_orders" ON public.fo_orders;
CREATE POLICY "open_fo_orders" ON public.fo_orders FOR ALL TO public USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "open_fo_order_lines" ON public.fo_order_lines;
CREATE POLICY "open_fo_order_lines" ON public.fo_order_lines FOR ALL TO public USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "open_fo_status_history" ON public.fo_order_status_history;
CREATE POLICY "open_fo_status_history" ON public.fo_order_status_history FOR ALL TO public USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "open_fo_documents" ON public.fo_order_documents;
CREATE POLICY "open_fo_documents" ON public.fo_order_documents FOR ALL TO public USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "open_fo_cost_history" ON public.fo_product_cost_history;
CREATE POLICY "open_fo_cost_history" ON public.fo_product_cost_history FOR ALL TO public USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "open_fo_restock" ON public.fo_restock_suggestions;
CREATE POLICY "open_fo_restock" ON public.fo_restock_suggestions FOR ALL TO public USING (true) WITH CHECK (true);

-- 10. MOCK DATA

DO $$
DECLARE
  sup1 UUID;
  sup2 UUID;
  ord1 UUID := gen_random_uuid();
  ord2 UUID := gen_random_uuid();
  ord3 UUID := gen_random_uuid();
BEGIN
  SELECT id INTO sup1 FROM public.suppliers ORDER BY created_at LIMIT 1;
  SELECT id INTO sup2 FROM public.suppliers ORDER BY created_at OFFSET 1 LIMIT 1;

  IF sup1 IS NULL THEN
    RAISE NOTICE 'No suppliers found, skipping mock data';
    RETURN;
  END IF;

  IF sup2 IS NULL THEN
    sup2 := sup1;
  END IF;

  INSERT INTO public.fo_orders (id, supplier_id, order_number, order_status, currency, exchange_rate,
    subtotal, transport_cost, customs_cost, total_real_cost, payment_status, notes)
  VALUES
    (ord1, sup1, 'FO-2026-001', 'shipped', 'EUR', 1,
     1250.00, 85.00, 45.00, 1380.00, 'paid', 'Commande printemps 2026'),
    (ord2, sup1, 'FO-2026-002', 'draft', 'EUR', 1,
     680.00, 0, 0, 680.00, 'pending', 'Réassort soins visage'),
    (ord3, sup2, 'FO-2026-003', 'awaiting_validation', 'USD', 1.08,
     920.00, 60.00, 30.00, 1010.00, 'pending', 'Commande accessoires')
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.fo_order_lines (order_id, product_name, product_ref, qty_ordered, qty_received, unit_price, line_total, sale_price, gross_margin, margin_rate)
  VALUES
    (ord1, 'Sérum Vitamine C 30ml', 'SVC-030', 20, 20, 8.50, 170.00, 24.90, 16.40, 65.86),
    (ord1, 'Crème Hydratante SPF50', 'CH-SPF50', 15, 15, 12.00, 180.00, 32.00, 20.00, 62.50),
    (ord1, 'Huile Argan Pure 50ml', 'HAP-050', 30, 28, 6.80, 204.00, 18.90, 12.10, 64.02),
    (ord2, 'Masque Argile Kaolin', 'MAK-100', 25, 0, 5.20, 130.00, 14.90, 9.70, 65.10),
    (ord2, 'Tonique Eau Florale Rose', 'TEFR-200', 20, 0, 7.40, 148.00, 19.90, 12.50, 62.81),
    (ord3, 'Pinceau Fond de Teint', 'PFT-01', 40, 0, 3.80, 152.00, 12.90, 9.10, 70.54),
    (ord3, 'Palette Fards à Paupières', 'PFP-12', 15, 0, 18.50, 277.50, 49.90, 31.40, 62.93)
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.fo_order_status_history (order_id, old_status, new_status, changed_by, comment)
  VALUES
    (ord1, 'draft', 'sent', 'Sophie Fontaine', 'Commande envoyée par email'),
    (ord1, 'sent', 'validated', 'Fournisseur', 'Validée par le fournisseur'),
    (ord1, 'validated', 'paid', 'Sophie Fontaine', 'Virement effectué'),
    (ord1, 'paid', 'shipped', 'Fournisseur', 'Expédiée — tracking FR123456789'),
    (ord2, 'draft', 'draft', 'Sophie Fontaine', 'Brouillon créé'),
    (ord3, 'draft', 'sent', 'Sophie Fontaine', 'Envoyée au fournisseur'),
    (ord3, 'sent', 'awaiting_validation', 'system', 'En attente de validation')
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.fo_restock_suggestions (product_name, product_ref, supplier_id, current_stock, min_stock, suggested_qty, last_purchase_price, last_real_cost, recent_sales, restock_status)
  VALUES
    ('Sérum Vitamine C 30ml', 'SVC-030', sup1, 3, 10, 20, 8.50, 9.20, 45, 'suggested'),
    ('Crème Hydratante SPF50', 'CH-SPF50', sup1, 0, 8, 15, 12.00, 13.10, 38, 'suggested'),
    ('Huile Argan Pure 50ml', 'HAP-050', sup1, 5, 12, 25, 6.80, 7.40, 52, 'suggested'),
    ('Masque Argile Kaolin', 'MAK-100', sup1, 8, 10, 15, 5.20, 5.80, 22, 'suggested'),
    ('Vernis Gel UV Rouge', 'VGR-001', sup2, 2, 15, 30, 2.10, 2.40, 67, 'suggested'),
    ('Fond de Teint Longue Tenue', 'FLT-02', sup2, 0, 5, 10, 9.80, 10.60, 18, 'suggested'),
    ('Mascara Volume Extrême', 'MVE-01', sup2, 1, 8, 20, 4.50, 4.90, 41, 'suggested'),
    ('Gloss Lèvres Rose Nude', 'GLR-05', sup2, 12, 10, 0, 3.20, 3.50, 8, 'suspended')
  ON CONFLICT (id) DO NOTHING;

EXCEPTION
  WHEN OTHERS THEN
    RAISE NOTICE 'Mock data error: %', SQLERRM;
END $$;
