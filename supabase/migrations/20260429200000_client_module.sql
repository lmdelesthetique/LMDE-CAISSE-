-- ============================================================
-- CLIENT MODULE — BeautyPOS
-- ============================================================

-- 1. ENUM TYPES
DROP TYPE IF EXISTS public.client_gender CASCADE;
CREATE TYPE public.client_gender AS ENUM ('female', 'male', 'other', 'not_specified');

DROP TYPE IF EXISTS public.loyalty_tier CASCADE;
CREATE TYPE public.loyalty_tier AS ENUM ('bronze', 'silver', 'gold', 'platinum');

DROP TYPE IF EXISTS public.purchase_status CASCADE;
CREATE TYPE public.purchase_status AS ENUM ('completed', 'refunded', 'partial_refund', 'cancelled');

DROP TYPE IF EXISTS public.payment_method_pos CASCADE;
CREATE TYPE public.payment_method_pos AS ENUM ('CB', 'cash', 'mixed', 'transfer', 'installment', 'deposit');

-- 2. CLIENTS TABLE
CREATE TABLE IF NOT EXISTS public.clients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  whatsapp TEXT,
  date_of_birth DATE,
  gender public.client_gender DEFAULT 'not_specified',
  address TEXT,
  city TEXT,
  postal_code TEXT,
  country TEXT DEFAULT 'France',
  notes TEXT,
  loyalty_points INTEGER DEFAULT 0,
  loyalty_tier public.loyalty_tier DEFAULT 'bronze',
  store_credit NUMERIC(10,2) DEFAULT 0,
  total_spent NUMERIC(10,2) DEFAULT 0,
  total_visits INTEGER DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- 3. PURCHASES TABLE
CREATE TABLE IF NOT EXISTS public.client_purchases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID REFERENCES public.clients(id) ON DELETE CASCADE,
  receipt_number TEXT NOT NULL,
  items JSONB NOT NULL DEFAULT '[]',
  subtotal_ht NUMERIC(10,2) NOT NULL DEFAULT 0,
  total_tva NUMERIC(10,2) NOT NULL DEFAULT 0,
  total_ttc NUMERIC(10,2) NOT NULL DEFAULT 0,
  discount_amount NUMERIC(10,2) DEFAULT 0,
  payment_method public.payment_method_pos DEFAULT 'CB',
  status public.purchase_status DEFAULT 'completed',
  loyalty_points_earned INTEGER DEFAULT 0,
  loyalty_points_used INTEGER DEFAULT 0,
  store_credit_used NUMERIC(10,2) DEFAULT 0,
  cashier_name TEXT,
  notes TEXT,
  purchased_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- 4. LOYALTY TRANSACTIONS TABLE
CREATE TABLE IF NOT EXISTS public.loyalty_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID REFERENCES public.clients(id) ON DELETE CASCADE,
  purchase_id UUID REFERENCES public.client_purchases(id) ON DELETE SET NULL,
  points_change INTEGER NOT NULL,
  reason TEXT NOT NULL,
  balance_after INTEGER NOT NULL,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- 5. INDEXES
CREATE INDEX IF NOT EXISTS idx_clients_phone ON public.clients(phone);
CREATE INDEX IF NOT EXISTS idx_clients_email ON public.clients(email);
CREATE INDEX IF NOT EXISTS idx_clients_name ON public.clients(last_name, first_name);
CREATE INDEX IF NOT EXISTS idx_client_purchases_client_id ON public.client_purchases(client_id);
CREATE INDEX IF NOT EXISTS idx_client_purchases_purchased_at ON public.client_purchases(purchased_at DESC);
CREATE INDEX IF NOT EXISTS idx_loyalty_transactions_client_id ON public.loyalty_transactions(client_id);

-- 6. FUNCTIONS

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION public.update_client_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$;

-- Update client stats after purchase
CREATE OR REPLACE FUNCTION public.update_client_stats_after_purchase()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'INSERT' AND NEW.status = 'completed' THEN
    UPDATE public.clients
    SET
      total_spent = total_spent + NEW.total_ttc,
      total_visits = total_visits + 1,
      loyalty_points = loyalty_points + NEW.loyalty_points_earned - NEW.loyalty_points_used,
      store_credit = store_credit - NEW.store_credit_used,
      updated_at = CURRENT_TIMESTAMP
    WHERE id = NEW.client_id;

    -- Update loyalty tier
    UPDATE public.clients
    SET loyalty_tier = CASE
      WHEN total_spent >= 2000 THEN 'platinum'::public.loyalty_tier
      WHEN total_spent >= 1000 THEN 'gold'::public.loyalty_tier
      WHEN total_spent >= 500 THEN 'silver'::public.loyalty_tier
      ELSE 'bronze'::public.loyalty_tier
    END
    WHERE id = NEW.client_id;
  END IF;
  RETURN NEW;
END;
$$;

-- 7. ENABLE RLS
ALTER TABLE public.clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.client_purchases ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.loyalty_transactions ENABLE ROW LEVEL SECURITY;

-- 8. RLS POLICIES — open access (POS app, no per-user auth on these tables)
DROP POLICY IF EXISTS "open_access_clients" ON public.clients;
CREATE POLICY "open_access_clients" ON public.clients FOR ALL TO public USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "open_access_client_purchases" ON public.client_purchases;
CREATE POLICY "open_access_client_purchases" ON public.client_purchases FOR ALL TO public USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "open_access_loyalty_transactions" ON public.loyalty_transactions;
CREATE POLICY "open_access_loyalty_transactions" ON public.loyalty_transactions FOR ALL TO public USING (true) WITH CHECK (true);

-- 9. TRIGGERS
DROP TRIGGER IF EXISTS trg_client_updated_at ON public.clients;
CREATE TRIGGER trg_client_updated_at
  BEFORE UPDATE ON public.clients
  FOR EACH ROW EXECUTE FUNCTION public.update_client_updated_at();

DROP TRIGGER IF EXISTS trg_update_client_stats ON public.client_purchases;
CREATE TRIGGER trg_update_client_stats
  AFTER INSERT ON public.client_purchases
  FOR EACH ROW EXECUTE FUNCTION public.update_client_stats_after_purchase();

-- 10. MOCK DATA
DO $$
DECLARE
  c1 UUID := gen_random_uuid();
  c2 UUID := gen_random_uuid();
  c3 UUID := gen_random_uuid();
  c4 UUID := gen_random_uuid();
  c5 UUID := gen_random_uuid();
  p1 UUID := gen_random_uuid();
  p2 UUID := gen_random_uuid();
  p3 UUID := gen_random_uuid();
  p4 UUID := gen_random_uuid();
  p5 UUID := gen_random_uuid();
  p6 UUID := gen_random_uuid();
BEGIN
  -- Insert clients
  INSERT INTO public.clients (id, first_name, last_name, email, phone, whatsapp, date_of_birth, gender, city, postal_code, country, notes, loyalty_points, loyalty_tier, store_credit, total_spent, total_visits, is_active)
  VALUES
    (c1, 'Amira', 'Benali', 'amira.benali@email.com', '06 12 34 56 78', '06 12 34 56 78', '1992-03-15', 'female', 'Paris', '75011', 'France', 'Cliente fidèle, préfère les produits naturels', 340, 'silver', 0, 680.50, 12, true),
    (c2, 'Léa', 'Morin', 'lea.morin@email.com', '06 98 76 54 32', '06 98 76 54 32', '1988-07-22', 'female', 'Lyon', '69003', 'France', 'Achète souvent pour offrir', 820, 'gold', 59.80, 1240.00, 28, true),
    (c3, 'Priya', 'Sharma', 'priya.sharma@email.com', '07 11 22 33 44', NULL, '1995-11-08', 'female', 'Marseille', '13001', 'France', NULL, 155, 'bronze', 0, 310.00, 6, true),
    (c4, 'Camille', 'Rousseau', 'camille.rousseau@email.com', '06 55 44 33 22', '06 55 44 33 22', '1985-01-30', 'female', 'Paris', '75008', 'France', 'VIP — traitement prioritaire', 1240, 'platinum', 0, 2480.00, 45, true),
    (c5, 'Yasmine', 'Khalil', 'yasmine.khalil@email.com', '06 77 88 99 00', NULL, '2000-05-12', 'female', 'Bordeaux', '33000', 'France', NULL, 90, 'bronze', 0, 180.00, 4, true)
  ON CONFLICT (id) DO NOTHING;

  -- Insert purchases for Amira
  INSERT INTO public.client_purchases (id, client_id, receipt_number, items, subtotal_ht, total_tva, total_ttc, payment_method, status, loyalty_points_earned, cashier_name, purchased_at)
  VALUES
    (p1, c1, 'REC-2026-0412', '[{"name":"Strass Dentaires 200pcs","qty":2,"price":29.90,"total":59.80},{"name":"Vernis Semi-Permanent Rose","qty":1,"price":12.50,"total":12.50}]', 66.67, 5.67, 72.34, 'CB', 'completed', 72, 'Sophie Fontaine', NOW() - INTERVAL '15 days'),
    (p2, c1, 'REC-2026-0389', '[{"name":"Kit Nail Art Complet","qty":1,"price":45.00,"total":45.00}]', 41.44, 3.52, 44.96, 'cash', 'completed', 45, 'Sophie Fontaine', NOW() - INTERVAL '32 days')
  ON CONFLICT (id) DO NOTHING;

  -- Insert purchases for Léa
  INSERT INTO public.client_purchases (id, client_id, receipt_number, items, subtotal_ht, total_tva, total_ttc, payment_method, status, loyalty_points_earned, store_credit_used, cashier_name, purchased_at)
  VALUES
    (p3, c2, 'REC-2026-0445', '[{"name":"Gel UV Builder Clear","qty":3,"price":18.90,"total":56.70},{"name":"Lime Professionnelle","qty":2,"price":4.50,"total":9.00}]', 60.28, 5.12, 65.40, 'CB', 'completed', 65, 0, 'Sophie Fontaine', NOW() - INTERVAL '5 days'),
    (p4, c2, 'REC-2026-0401', '[{"name":"Capsules Ongles Transparentes x500","qty":1,"price":22.00,"total":22.00},{"name":"Primer Acide","qty":1,"price":9.90,"total":9.90}]', 29.40, 2.50, 31.90, 'mixed', 'completed', 32, 10.00, 'Sophie Fontaine', NOW() - INTERVAL '20 days')
  ON CONFLICT (id) DO NOTHING;

  -- Insert purchases for Camille
  INSERT INTO public.client_purchases (id, client_id, receipt_number, items, subtotal_ht, total_tva, total_ttc, payment_method, status, loyalty_points_earned, cashier_name, purchased_at)
  VALUES
    (p5, c4, 'REC-2026-0460', '[{"name":"Set Complet Nail Art Premium","qty":1,"price":89.00,"total":89.00},{"name":"Lampe UV/LED 48W","qty":1,"price":35.00,"total":35.00}]', 114.75, 9.75, 124.50, 'CB', 'completed', 124, 'Sophie Fontaine', NOW() - INTERVAL '2 days'),
    (p6, c4, 'REC-2026-0388', '[{"name":"Poudre Acrylique Rose","qty":2,"price":14.90,"total":29.80}]', 27.47, 2.33, 29.80, 'CB', 'completed', 30, 'Sophie Fontaine', NOW() - INTERVAL '35 days')
  ON CONFLICT (id) DO NOTHING;

  -- Loyalty transactions for Amira
  INSERT INTO public.loyalty_transactions (client_id, purchase_id, points_change, reason, balance_after)
  VALUES
    (c1, p1, 72, 'Achat REC-2026-0412', 268),
    (c1, p2, 45, 'Achat REC-2026-0389', 223)
  ON CONFLICT (id) DO NOTHING;

  -- Loyalty transactions for Léa
  INSERT INTO public.loyalty_transactions (client_id, purchase_id, points_change, reason, balance_after)
  VALUES
    (c2, p3, 65, 'Achat REC-2026-0445', 755),
    (c2, p4, 32, 'Achat REC-2026-0401', 723),
    (c2, NULL, 50, 'Bonus bienvenue', 691)
  ON CONFLICT (id) DO NOTHING;

EXCEPTION
  WHEN OTHERS THEN
    RAISE NOTICE 'Mock data insertion failed: %', SQLERRM;
END $$;
