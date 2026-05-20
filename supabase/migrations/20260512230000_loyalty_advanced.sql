-- Advanced Loyalty System Migration
-- Tables: loyalty_tiers, loyalty_rewards, loyalty_reward_products, loyalty_redemptions

-- ── 1. LOYALTY TIERS ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.loyalty_tiers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  points_required INTEGER NOT NULL,
  reward_type TEXT NOT NULL,
  reward_description TEXT NOT NULL,
  reward_value NUMERIC(10,2) DEFAULT 0,
  reward_product_id UUID DEFAULT NULL,
  is_active BOOLEAN DEFAULT true,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- ── 2. LOYALTY REWARD PRODUCTS ────────────────────────────────────────────────
-- Products that can be assigned as loyalty rewards (to clear old stock)
CREATE TABLE IF NOT EXISTS public.loyalty_reward_products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_name TEXT NOT NULL,
  sku TEXT,
  description TEXT,
  stock_quantity INTEGER DEFAULT 0,
  reward_category TEXT DEFAULT 'gift',
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- ── 3. LOYALTY REDEMPTIONS ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.loyalty_redemptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID REFERENCES public.clients(id) ON DELETE CASCADE,
  tier_id UUID REFERENCES public.loyalty_tiers(id) ON DELETE SET NULL,
  points_at_redemption INTEGER NOT NULL,
  reward_type TEXT NOT NULL,
  reward_description TEXT NOT NULL,
  reward_value NUMERIC(10,2) DEFAULT 0,
  reward_product_id UUID REFERENCES public.loyalty_reward_products(id) ON DELETE SET NULL,
  status TEXT DEFAULT 'pending',
  redeemed_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  cashier_name TEXT,
  notes TEXT
);

-- ── 4. INDEXES ────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_loyalty_tiers_points ON public.loyalty_tiers(points_required);
CREATE INDEX IF NOT EXISTS idx_loyalty_tiers_active ON public.loyalty_tiers(is_active);
CREATE INDEX IF NOT EXISTS idx_loyalty_redemptions_client ON public.loyalty_redemptions(client_id);
CREATE INDEX IF NOT EXISTS idx_loyalty_redemptions_tier ON public.loyalty_redemptions(tier_id);
CREATE INDEX IF NOT EXISTS idx_loyalty_reward_products_active ON public.loyalty_reward_products(is_active);

-- ── 5. UPDATED_AT TRIGGER ─────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.update_loyalty_tiers_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_loyalty_tiers_updated_at ON public.loyalty_tiers;
CREATE TRIGGER trg_loyalty_tiers_updated_at
  BEFORE UPDATE ON public.loyalty_tiers
  FOR EACH ROW EXECUTE FUNCTION public.update_loyalty_tiers_updated_at();

-- ── 6. RLS ────────────────────────────────────────────────────────────────────
ALTER TABLE public.loyalty_tiers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.loyalty_reward_products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.loyalty_redemptions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "open_access_loyalty_tiers" ON public.loyalty_tiers;
CREATE POLICY "open_access_loyalty_tiers" ON public.loyalty_tiers FOR ALL TO public USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "open_access_loyalty_reward_products" ON public.loyalty_reward_products;
CREATE POLICY "open_access_loyalty_reward_products" ON public.loyalty_reward_products FOR ALL TO public USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "open_access_loyalty_redemptions" ON public.loyalty_redemptions;
CREATE POLICY "open_access_loyalty_redemptions" ON public.loyalty_redemptions FOR ALL TO public USING (true) WITH CHECK (true);

-- ── 7. SEED DEFAULT TIERS ─────────────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.loyalty_tiers LIMIT 1) THEN
    INSERT INTO public.loyalty_tiers (name, points_required, reward_type, reward_description, reward_value, sort_order) VALUES
      ('Palier 1 — Bienvenue',       100,  'discount',       'Réduction -5% sur votre prochain achat',            5,   1),
      ('Palier 2 — Fidèle',          200,  'free_product',   'Produit surprise offert',                           0,   2),
      ('Palier 3 — Régulière',       320,  'double_points',  'Points doublés sur votre prochain achat',           0,   3),
      ('Palier 4 — Privilège',       420,  'discount',       'Réduction -10% sur toute la boutique',              10,  4),
      ('Palier 5 — Or',              500,  'free_product',   'Ancienne collection offerte au choix',              0,   5),
      ('Palier 6 — Prestige',        650,  'private_offer',  'Offre privée exclusive — accès avant tout le monde',0,   6),
      ('Palier 7 — VIP',             700,  'vip_access',     'Accès offre VIP — pack fidélité premium',           0,   7),
      ('Palier 8 — Diamant',         1000, 'free_product',   'Cadeau surprise premium',                           0,   8),
      ('Palier 9 — Elite',           1050, 'discount',       'Remise catégorie spéciale -15%',                    15,  9),
      ('Palier 10 — Légende',        1500, 'buy_one_get_one','Offre 1 acheté = 1 offert sur sélection',           0,   10),
      ('Palier 11 — Ambassadrice',   2000, 'free_shipping',  'Livraison offerte + pack fidélité exclusif',        0,   11),
      ('Palier 12 — Icône',          3000, 'vip_access',     'Accès VIP illimité + remise permanente -20%',       20,  12),
      ('Palier 13 — Légende Ultime', 5000, 'private_offer',  'Programme ambassadrice — avantages sur mesure',     0,   13)
    ON CONFLICT (id) DO NOTHING;
  END IF;
END $$;

-- ── 8. SEED REWARD PRODUCTS ───────────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.loyalty_reward_products LIMIT 1) THEN
    INSERT INTO public.loyalty_reward_products (product_name, sku, description, stock_quantity, reward_category) VALUES
      ('Vernis à ongles collection printemps', 'VER-PRINT-01', 'Ancienne collection — couleurs pastel', 24, 'old_stock'),
      ('Crème hydratante mains 50ml',          'CRE-MAIN-50',  'Soin quotidien mains douces',           18, 'gift'),
      ('Masque visage purifiant',              'MAS-VIS-01',   'Masque argile — soin profond',          12, 'gift'),
      ('Trousse de maquillage',                'TRO-MAK-01',   'Trousse zippée — ancienne collection',  8,  'old_stock'),
      ('Sérum éclat 30ml',                     'SER-ECL-30',   'Sérum vitamine C — ancienne formule',   15, 'old_stock'),
      ('Palette fards à paupières',            'PAL-FAR-01',   'Palette 12 couleurs — collection passée',6, 'old_stock')
    ON CONFLICT (id) DO NOTHING;
  END IF;
END $$;
