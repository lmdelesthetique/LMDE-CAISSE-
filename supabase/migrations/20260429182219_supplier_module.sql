-- ============================================================
-- SUPPLIER MODULE — BeautyPOS
-- ============================================================

-- 1. ENUM TYPES
DROP TYPE IF EXISTS public.supplier_reliability CASCADE;
CREATE TYPE public.supplier_reliability AS ENUM ('excellent', 'good', 'average', 'poor', 'unknown');

DROP TYPE IF EXISTS public.order_status CASCADE;
CREATE TYPE public.order_status AS ENUM (
  'draft', 'sent', 'awaiting_validation', 'modification_requested',
  'validated', 'awaiting_payment', 'payment_sent', 'payment_confirmed',
  'in_production', 'ready_to_ship', 'shipped', 'partially_received',
  'received', 'issue_reported', 'refund_requested', 'refund_received', 'cancelled'
);

DROP TYPE IF EXISTS public.payment_status CASCADE;
CREATE TYPE public.payment_status AS ENUM (
  'pending', 'sent', 'confirmed', 'partial', 'overdue'
);

DROP TYPE IF EXISTS public.payment_method CASCADE;
CREATE TYPE public.payment_method AS ENUM (
  'wire_transfer', 'wise', 'alibaba', 'paypal', 'other'
);

DROP TYPE IF EXISTS public.claim_status CASCADE;
CREATE TYPE public.claim_status AS ENUM (
  'draft', 'sent', 'awaiting_response', 'accepted', 'refused',
  'refund_pending', 'refund_received', 'closed'
);

DROP TYPE IF EXISTS public.claim_type CASCADE;
CREATE TYPE public.claim_type AS ENUM (
  'defective', 'wrong_color', 'wrong_reference', 'bad_quality',
  'broken', 'wrong_packaging', 'missing_quantity', 'other'
);

DROP TYPE IF EXISTS public.claim_action CASCADE;
CREATE TYPE public.claim_action AS ENUM (
  'refund', 'credit', 'replacement', 'future_modification'
);

DROP TYPE IF EXISTS public.message_sender CASCADE;
CREATE TYPE public.message_sender AS ENUM ('store', 'supplier');

-- 2. CORE TABLE: suppliers
CREATE TABLE IF NOT EXISTS public.suppliers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_name TEXT NOT NULL,
  contact_name TEXT,
  logo_url TEXT,
  email TEXT,
  phone TEXT,
  whatsapp TEXT,
  wechat TEXT,
  address TEXT,
  country TEXT DEFAULT 'Chine',
  language TEXT DEFAULT 'Chinois',
  website TEXT,
  alibaba_link TEXT,
  categories TEXT[],
  bank_details TEXT,
  payment_conditions TEXT,
  production_delay_days INTEGER DEFAULT 14,
  shipping_delay_days INTEGER DEFAULT 21,
  minimum_order TEXT,
  notes TEXT,
  reliability public.supplier_reliability DEFAULT 'unknown',
  last_contact_at TIMESTAMPTZ,
  last_order_at TIMESTAMPTZ,
  is_active BOOLEAN DEFAULT true,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- 3. SUPPLIER ORDERS
CREATE TABLE IF NOT EXISTS public.supplier_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier_id UUID NOT NULL REFERENCES public.suppliers(id) ON DELETE CASCADE,
  order_number TEXT NOT NULL,
  order_status public.order_status DEFAULT 'draft',
  items JSONB DEFAULT '[]',
  subtotal NUMERIC(12,2) DEFAULT 0,
  shipping_cost NUMERIC(12,2) DEFAULT 0,
  customs_cost NUMERIC(12,2) DEFAULT 0,
  other_costs NUMERIC(12,2) DEFAULT 0,
  total_amount NUMERIC(12,2) DEFAULT 0,
  currency TEXT DEFAULT 'EUR',
  exchange_rate NUMERIC(10,4) DEFAULT 1,
  notes TEXT,
  tracking_number TEXT,
  expected_delivery_at DATE,
  shipped_at TIMESTAMPTZ,
  received_at TIMESTAMPTZ,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- 4. SUPPLIER PAYMENTS
CREATE TABLE IF NOT EXISTS public.supplier_payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier_id UUID NOT NULL REFERENCES public.suppliers(id) ON DELETE CASCADE,
  order_id UUID REFERENCES public.supplier_orders(id) ON DELETE SET NULL,
  amount NUMERIC(12,2) NOT NULL,
  currency TEXT DEFAULT 'EUR',
  exchange_rate NUMERIC(10,4) DEFAULT 1,
  payment_method public.payment_method DEFAULT 'wire_transfer',
  payment_status public.payment_status DEFAULT 'pending',
  proof_url TEXT,
  paid_at TIMESTAMPTZ,
  confirmed_at TIMESTAMPTZ,
  notes TEXT,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- 5. SUPPLIER CLAIMS
CREATE TABLE IF NOT EXISTS public.supplier_claims (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier_id UUID NOT NULL REFERENCES public.suppliers(id) ON DELETE CASCADE,
  order_id UUID REFERENCES public.supplier_orders(id) ON DELETE SET NULL,
  claim_type public.claim_type DEFAULT 'other',
  claim_status public.claim_status DEFAULT 'draft',
  requested_action public.claim_action DEFAULT 'refund',
  product_name TEXT,
  description TEXT NOT NULL,
  affected_quantity INTEGER DEFAULT 1,
  estimated_loss NUMERIC(12,2) DEFAULT 0,
  photo_urls TEXT[] DEFAULT '{}',
  resolution_notes TEXT,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- 6. SUPPLIER MESSAGES
CREATE TABLE IF NOT EXISTS public.supplier_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier_id UUID NOT NULL REFERENCES public.suppliers(id) ON DELETE CASCADE,
  order_id UUID REFERENCES public.supplier_orders(id) ON DELETE SET NULL,
  claim_id UUID REFERENCES public.supplier_claims(id) ON DELETE SET NULL,
  sender public.message_sender DEFAULT 'store',
  content TEXT,
  attachment_url TEXT,
  attachment_type TEXT,
  is_read BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- 7. SUPPLIER DOCUMENTS
CREATE TABLE IF NOT EXISTS public.supplier_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier_id UUID NOT NULL REFERENCES public.suppliers(id) ON DELETE CASCADE,
  order_id UUID REFERENCES public.supplier_orders(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  file_url TEXT NOT NULL,
  file_type TEXT,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- 8. INDEXES
CREATE INDEX IF NOT EXISTS idx_suppliers_is_active ON public.suppliers(is_active);
CREATE INDEX IF NOT EXISTS idx_suppliers_country ON public.suppliers(country);
CREATE INDEX IF NOT EXISTS idx_supplier_orders_supplier_id ON public.supplier_orders(supplier_id);
CREATE INDEX IF NOT EXISTS idx_supplier_orders_status ON public.supplier_orders(order_status);
CREATE INDEX IF NOT EXISTS idx_supplier_payments_supplier_id ON public.supplier_payments(supplier_id);
CREATE INDEX IF NOT EXISTS idx_supplier_payments_order_id ON public.supplier_payments(order_id);
CREATE INDEX IF NOT EXISTS idx_supplier_claims_supplier_id ON public.supplier_claims(supplier_id);
CREATE INDEX IF NOT EXISTS idx_supplier_messages_supplier_id ON public.supplier_messages(supplier_id);
CREATE INDEX IF NOT EXISTS idx_supplier_messages_created_at ON public.supplier_messages(created_at DESC);

-- 9. UPDATED_AT TRIGGER FUNCTION
CREATE OR REPLACE FUNCTION public.update_supplier_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_suppliers_updated_at ON public.suppliers;
CREATE TRIGGER trg_suppliers_updated_at
  BEFORE UPDATE ON public.suppliers
  FOR EACH ROW EXECUTE FUNCTION public.update_supplier_updated_at();

DROP TRIGGER IF EXISTS trg_supplier_orders_updated_at ON public.supplier_orders;
CREATE TRIGGER trg_supplier_orders_updated_at
  BEFORE UPDATE ON public.supplier_orders
  FOR EACH ROW EXECUTE FUNCTION public.update_supplier_updated_at();

DROP TRIGGER IF EXISTS trg_supplier_payments_updated_at ON public.supplier_payments;
CREATE TRIGGER trg_supplier_payments_updated_at
  BEFORE UPDATE ON public.supplier_payments
  FOR EACH ROW EXECUTE FUNCTION public.update_supplier_updated_at();

DROP TRIGGER IF EXISTS trg_supplier_claims_updated_at ON public.supplier_claims;
CREATE TRIGGER trg_supplier_claims_updated_at
  BEFORE UPDATE ON public.supplier_claims
  FOR EACH ROW EXECUTE FUNCTION public.update_supplier_updated_at();

-- 10. ENABLE RLS
ALTER TABLE public.suppliers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.supplier_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.supplier_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.supplier_claims ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.supplier_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.supplier_documents ENABLE ROW LEVEL SECURITY;

-- 11. RLS POLICIES (open access for authenticated users — store staff)
DROP POLICY IF EXISTS "auth_all_suppliers" ON public.suppliers;
CREATE POLICY "auth_all_suppliers" ON public.suppliers
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "auth_all_supplier_orders" ON public.supplier_orders;
CREATE POLICY "auth_all_supplier_orders" ON public.supplier_orders
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "auth_all_supplier_payments" ON public.supplier_payments;
CREATE POLICY "auth_all_supplier_payments" ON public.supplier_payments
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "auth_all_supplier_claims" ON public.supplier_claims;
CREATE POLICY "auth_all_supplier_claims" ON public.supplier_claims
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "auth_all_supplier_messages" ON public.supplier_messages;
CREATE POLICY "auth_all_supplier_messages" ON public.supplier_messages
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "auth_all_supplier_documents" ON public.supplier_documents;
CREATE POLICY "auth_all_supplier_documents" ON public.supplier_documents
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- 12. MOCK DATA
DO $$
DECLARE
  sup1_id UUID := gen_random_uuid();
  sup2_id UUID := gen_random_uuid();
  sup3_id UUID := gen_random_uuid();
  ord1_id UUID := gen_random_uuid();
  ord2_id UUID := gen_random_uuid();
  ord3_id UUID := gen_random_uuid();
  pay1_id UUID := gen_random_uuid();
  pay2_id UUID := gen_random_uuid();
  clm1_id UUID := gen_random_uuid();
BEGIN
  -- Suppliers
  INSERT INTO public.suppliers (id, company_name, contact_name, email, phone, whatsapp, country, language, categories, reliability, production_delay_days, shipping_delay_days, minimum_order, notes, last_contact_at, last_order_at)
  VALUES
    (sup1_id, 'Guangzhou Nail Art Co.', 'Li Wei', 'liwei@gnailart.cn', '+86 138 0000 1111', '+86 138 0000 1111', 'Chine', 'Chinois / Anglais', ARRAY['Onglerie', 'Gel X', 'Semi-permanent'], 'excellent', 10, 18, '500 USD', 'Fournisseur principal onglerie. Très fiable, livraisons ponctuelles.', NOW() - INTERVAL '3 days', NOW() - INTERVAL '15 days'),
    (sup2_id, 'Shenzhen Beauty Supply', 'Chen Mei', 'chenmei@szbeauty.com', '+86 139 0000 2222', '+86 139 0000 2222', 'Chine', 'Chinois', ARRAY['Cils', 'Brow lift', 'Consommables'], 'good', 14, 21, '300 USD', 'Bon rapport qualite-prix pour les cils et sourcils.', NOW() - INTERVAL '7 days', NOW() - INTERVAL '30 days'),
    (sup3_id, 'Paris Mobilier Pro', 'Sophie Durand', 'contact@parismobilier.fr', '+33 1 23 45 67 89', '+33 6 12 34 56 78', 'France', 'Français', ARRAY['Mobilier', 'Machines'], 'good', 7, 5, '1000 EUR', 'Fournisseur mobilier professionnel. Livraison France uniquement.', NOW() - INTERVAL '14 days', NOW() - INTERVAL '45 days')
  ON CONFLICT (id) DO NOTHING;

  -- Orders
  INSERT INTO public.supplier_orders (id, supplier_id, order_number, order_status, items, subtotal, shipping_cost, customs_cost, total_amount, currency, notes, tracking_number, expected_delivery_at)
  VALUES
    (ord1_id, sup1_id, 'CMD-2026-001', 'shipped', '[{"name":"Gel X Kit Pro","qty":50,"unit_price":8.50,"total":425},{"name":"Top Coat UV","qty":100,"unit_price":3.20,"total":320}]', 745.00, 85.00, 45.00, 875.00, 'EUR', 'Commande urgente avant saison estivale', 'YT2026041500123CN', CURRENT_DATE + INTERVAL '5 days'),
    (ord2_id, sup2_id, 'CMD-2026-002', 'in_production', '[{"name":"Extensions Cils 0.07mm","qty":200,"unit_price":2.80,"total":560},{"name":"Colle Cils Pro","qty":50,"unit_price":4.50,"total":225}]', 785.00, 65.00, 35.00, 885.00, 'EUR', 'Renouvellement stock cils', NULL, CURRENT_DATE + INTERVAL '18 days'),
    (ord3_id, sup3_id, 'CMD-2026-003', 'awaiting_payment', '[{"name":"Table de manucure LED","qty":2,"unit_price":380.00,"total":760},{"name":"Fauteuil client","qty":3,"unit_price":290.00,"total":870}]', 1630.00, 120.00, 0, 1750.00, 'EUR', 'Renovation espace manucure', NULL, CURRENT_DATE + INTERVAL '12 days')
  ON CONFLICT (id) DO NOTHING;

  -- Payments
  INSERT INTO public.supplier_payments (id, supplier_id, order_id, amount, currency, payment_method, payment_status, paid_at, notes)
  VALUES
    (pay1_id, sup1_id, ord1_id, 875.00, 'EUR', 'wise', 'confirmed', NOW() - INTERVAL '20 days', 'Paiement total commande CMD-2026-001'),
    (pay2_id, sup2_id, ord2_id, 442.50, 'EUR', 'wire_transfer', 'confirmed', NOW() - INTERVAL '10 days', 'Acompte 50% commande CMD-2026-002')
  ON CONFLICT (id) DO NOTHING;

  -- Claims
  INSERT INTO public.supplier_claims (id, supplier_id, order_id, claim_type, claim_status, requested_action, product_name, description, affected_quantity, estimated_loss)
  VALUES
    (clm1_id, sup2_id, ord2_id, 'defective', 'sent', 'refund', 'Extensions Cils 0.07mm', 'Lot recu avec 15 boites presentant des cils colles entre eux, inutilisables. Photos jointes.', 15, 42.00)
  ON CONFLICT (id) DO NOTHING;

  -- Messages
  INSERT INTO public.supplier_messages (supplier_id, order_id, sender, content)
  VALUES
    (sup1_id, ord1_id, 'store', 'Bonjour Li Wei, pouvez-vous confirmer le numero de suivi pour la commande CMD-2026-001 ?'),
    (sup1_id, ord1_id, 'supplier', 'Bonjour ! Numero de suivi : YT2026041500123CN. Livraison prevue dans 5 jours.'),
    (sup2_id, ord2_id, 'store', 'Chen Mei, nous avons un probleme avec le dernier lot de cils. Voir reclamation jointe.'),
    (sup2_id, clm1_id, 'supplier', 'Nous sommes desoles pour ce probleme. Nous allons verifier et vous repondre sous 48h.')
  ON CONFLICT (id) DO NOTHING;

EXCEPTION
  WHEN OTHERS THEN
    RAISE NOTICE 'Mock data insertion failed: %', SQLERRM;
END $$;
