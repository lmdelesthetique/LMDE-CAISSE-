-- ============================================================
-- INVENTORY MODULE — BeautyPOS
-- ============================================================

-- 1. ENUM TYPES
DROP TYPE IF EXISTS public.stock_movement_type CASCADE;
CREATE TYPE public.stock_movement_type AS ENUM ('entry', 'exit', 'adjustment', 'transfer', 'return');

DROP TYPE IF EXISTS public.stock_alert_level CASCADE;
CREATE TYPE public.stock_alert_level AS ENUM ('ok', 'warning', 'critical', 'out_of_stock');

-- 2. LOCATIONS TABLE
CREATE TABLE IF NOT EXISTS public.inventory_locations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  address TEXT,
  is_main BOOLEAN DEFAULT false,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- 3. PRODUCTS INVENTORY TABLE (extends product catalog)
CREATE TABLE IF NOT EXISTS public.inventory_products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_name TEXT NOT NULL,
  sku TEXT,
  category TEXT,
  supplier_id UUID REFERENCES public.suppliers(id) ON DELETE SET NULL,
  unit_cost DECIMAL(10,2) DEFAULT 0,
  selling_price DECIMAL(10,2) DEFAULT 0,
  min_stock_level INTEGER DEFAULT 5,
  max_stock_level INTEGER DEFAULT 100,
  reorder_point INTEGER DEFAULT 10,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- 4. STOCK LEVELS PER LOCATION
CREATE TABLE IF NOT EXISTS public.inventory_stock_levels (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID NOT NULL REFERENCES public.inventory_products(id) ON DELETE CASCADE,
  location_id UUID NOT NULL REFERENCES public.inventory_locations(id) ON DELETE CASCADE,
  quantity INTEGER DEFAULT 0,
  alert_level public.stock_alert_level DEFAULT 'ok',
  last_updated TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(product_id, location_id)
);

-- 5. STOCK MOVEMENTS TABLE
CREATE TABLE IF NOT EXISTS public.inventory_movements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID NOT NULL REFERENCES public.inventory_products(id) ON DELETE CASCADE,
  location_id UUID NOT NULL REFERENCES public.inventory_locations(id) ON DELETE CASCADE,
  movement_type public.stock_movement_type NOT NULL,
  quantity INTEGER NOT NULL,
  unit_cost DECIMAL(10,2),
  total_cost DECIMAL(10,2),
  supplier_id UUID REFERENCES public.suppliers(id) ON DELETE SET NULL,
  reference TEXT,
  notes TEXT,
  performed_by TEXT DEFAULT 'Admin',
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- 6. INDEXES
CREATE INDEX IF NOT EXISTS idx_inventory_movements_product_id ON public.inventory_movements(product_id);
CREATE INDEX IF NOT EXISTS idx_inventory_movements_location_id ON public.inventory_movements(location_id);
CREATE INDEX IF NOT EXISTS idx_inventory_movements_type ON public.inventory_movements(movement_type);
CREATE INDEX IF NOT EXISTS idx_inventory_movements_created_at ON public.inventory_movements(created_at);
CREATE INDEX IF NOT EXISTS idx_inventory_stock_levels_product_id ON public.inventory_stock_levels(product_id);
CREATE INDEX IF NOT EXISTS idx_inventory_stock_levels_alert ON public.inventory_stock_levels(alert_level);
CREATE INDEX IF NOT EXISTS idx_inventory_products_supplier ON public.inventory_products(supplier_id);

-- 7. FUNCTION: update alert level on stock change
CREATE OR REPLACE FUNCTION public.update_stock_alert_level()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_min_stock INTEGER;
  v_reorder INTEGER;
  v_alert public.stock_alert_level;
BEGIN
  SELECT min_stock_level, reorder_point
  INTO v_min_stock, v_reorder
  FROM public.inventory_products
  WHERE id = NEW.product_id;

  IF NEW.quantity <= 0 THEN
    v_alert := 'out_of_stock';
  ELSIF NEW.quantity <= v_min_stock THEN
    v_alert := 'critical';
  ELSIF NEW.quantity <= v_reorder THEN
    v_alert := 'warning';
  ELSE
    v_alert := 'ok';
  END IF;

  NEW.alert_level := v_alert;
  NEW.last_updated := CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$;

-- 8. ENABLE RLS
ALTER TABLE public.inventory_locations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_stock_levels ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_movements ENABLE ROW LEVEL SECURITY;

-- 9. RLS POLICIES
DROP POLICY IF EXISTS "inventory_locations_all" ON public.inventory_locations;
CREATE POLICY "inventory_locations_all" ON public.inventory_locations
FOR ALL TO public USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "inventory_products_all" ON public.inventory_products;
CREATE POLICY "inventory_products_all" ON public.inventory_products
FOR ALL TO public USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "inventory_stock_levels_all" ON public.inventory_stock_levels;
CREATE POLICY "inventory_stock_levels_all" ON public.inventory_stock_levels
FOR ALL TO public USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "inventory_movements_all" ON public.inventory_movements;
CREATE POLICY "inventory_movements_all" ON public.inventory_movements
FOR ALL TO public USING (true) WITH CHECK (true);

-- 10. TRIGGERS
DROP TRIGGER IF EXISTS trg_update_stock_alert ON public.inventory_stock_levels;
CREATE TRIGGER trg_update_stock_alert
BEFORE INSERT OR UPDATE ON public.inventory_stock_levels
FOR EACH ROW EXECUTE FUNCTION public.update_stock_alert_level();

-- 11. MOCK DATA
DO $$
DECLARE
  loc_main UUID := gen_random_uuid();
  loc_reserve UUID := gen_random_uuid();
  loc_salon UUID := gen_random_uuid();
  p1 UUID := gen_random_uuid();
  p2 UUID := gen_random_uuid();
  p3 UUID := gen_random_uuid();
  p4 UUID := gen_random_uuid();
  p5 UUID := gen_random_uuid();
  p6 UUID := gen_random_uuid();
  p7 UUID := gen_random_uuid();
  p8 UUID := gen_random_uuid();
  sup_id UUID;
BEGIN
  -- Get first supplier if exists
  SELECT id INTO sup_id FROM public.suppliers LIMIT 1;

  -- Locations
  INSERT INTO public.inventory_locations (id, name, address, is_main, is_active) VALUES
    (loc_main,    'Boutique Principale',  '12 Rue de la Beauté, Paris 75001', true,  true),
    (loc_reserve, 'Réserve Arrière',      '12 Rue de la Beauté, Paris 75001', false, true),
    (loc_salon,   'Salon Espace Beauté',  '45 Avenue Lumière, Paris 75008',   false, true)
  ON CONFLICT (id) DO NOTHING;

  -- Products
  INSERT INTO public.inventory_products (id, product_name, sku, category, supplier_id, unit_cost, selling_price, min_stock_level, max_stock_level, reorder_point) VALUES
    (p1, 'Extension Cils Soie B-Curl',      'EXT-CIL-001', 'Extensions',  sup_id, 12.50, 28.00,  10, 100, 20),
    (p2, 'Lampe UV/LED 48W Pro',             'LAMP-UV-001', 'Équipement',  sup_id, 45.00, 89.00,   8,  50, 15),
    (p3, 'Semi-Permanent Color Box',         'COL-SEM-001', 'Couleur',     sup_id,  8.00, 22.00,  12,  80, 25),
    (p4, 'Table de Manucure Pliante Luxe',   'TAB-MAN-001', 'Mobilier',    sup_id,120.00,249.00,   5,  20,  8),
    (p5, 'Gel UV Transparent 30ml',          'GEL-UV-001',  'Consommable', sup_id,  3.50,  9.90,  20, 150, 40),
    (p6, 'Pinceau Nail Art Set 12pcs',       'PIN-ART-001', 'Accessoires', sup_id,  6.00, 18.00,  15, 100, 30),
    (p7, 'Dissolvant Acétone 500ml',         'DIS-ACE-001', 'Consommable', sup_id,  2.00,  6.50,  25, 200, 50),
    (p8, 'Faux Ongles Press-On Luxe 24pcs',  'FAU-ONG-001', 'Accessoires', sup_id,  4.50, 14.00,  18, 120, 35)
  ON CONFLICT (id) DO NOTHING;

  -- Stock levels (main location)
  INSERT INTO public.inventory_stock_levels (product_id, location_id, quantity) VALUES
    (p1, loc_main,    2),
    (p2, loc_main,    6),
    (p3, loc_main,    8),
    (p4, loc_main,    3),
    (p5, loc_main,   45),
    (p6, loc_main,   22),
    (p7, loc_main,   60),
    (p8, loc_main,   30)
  ON CONFLICT (product_id, location_id) DO UPDATE SET quantity = EXCLUDED.quantity;

  -- Stock levels (reserve)
  INSERT INTO public.inventory_stock_levels (product_id, location_id, quantity) VALUES
    (p1, loc_reserve, 15),
    (p2, loc_reserve,  8),
    (p3, loc_reserve, 20),
    (p5, loc_reserve, 80),
    (p7, loc_reserve,120)
  ON CONFLICT (product_id, location_id) DO UPDATE SET quantity = EXCLUDED.quantity;

  -- Stock levels (salon)
  INSERT INTO public.inventory_stock_levels (product_id, location_id, quantity) VALUES
    (p1, loc_salon,  5),
    (p3, loc_salon, 10),
    (p6, loc_salon, 12)
  ON CONFLICT (product_id, location_id) DO UPDATE SET quantity = EXCLUDED.quantity;

  -- Stock movements history
  INSERT INTO public.inventory_movements (product_id, location_id, movement_type, quantity, unit_cost, total_cost, supplier_id, reference, notes, performed_by, created_at) VALUES
    (p1, loc_main,    'entry',      50, 12.50,  625.00, sup_id, 'CMD-2026-042', 'Réception commande avril',    'Sophie F.',  now() - interval '15 days'),
    (p3, loc_main,    'entry',      40,  8.00,  320.00, sup_id, 'CMD-2026-041', 'Réapprovisionnement couleurs','Sophie F.',  now() - interval '12 days'),
    (p5, loc_main,    'entry',     100,  3.50,  350.00, sup_id, 'CMD-2026-040', 'Stock gel UV',                'Marie L.',   now() - interval '10 days'),
    (p1, loc_main,    'exit',       30,  null,   null,   null,  'VTE-2026-189', 'Ventes semaine 15',           'Caisse POS', now() - interval '8 days'),
    (p3, loc_main,    'exit',       20,  null,   null,   null,  'VTE-2026-190', 'Ventes semaine 15',           'Caisse POS', now() - interval '8 days'),
    (p2, loc_main,    'entry',      10, 45.00,  450.00, sup_id, 'CMD-2026-039', 'Nouvelles lampes UV',         'Sophie F.',  now() - interval '7 days'),
    (p1, loc_main,    'exit',       18,  null,   null,   null,  'VTE-2026-201', 'Ventes semaine 16',           'Caisse POS', now() - interval '5 days'),
    (p5, loc_main,    'exit',       55,  null,   null,   null,  'VTE-2026-202', 'Ventes semaine 16',           'Caisse POS', now() - interval '5 days'),
    (p1, loc_reserve, 'transfer',   10,  null,   null,   null,  'TRF-2026-012', 'Transfert vers boutique',     'Marie L.',   now() - interval '3 days'),
    (p7, loc_main,    'entry',      80,  2.00,  160.00, sup_id, 'CMD-2026-043', 'Réapprovisionnement dissolvant','Sophie F.',now() - interval '2 days'),
    (p4, loc_main,    'exit',        2,  null,   null,   null,  'VTE-2026-215', 'Vente tables manucure',       'Caisse POS', now() - interval '1 day'),
    (p6, loc_main,    'adjustment', -3,  null,   null,   null,  'ADJ-2026-005', 'Correction inventaire',       'Sophie F.',  now() - interval '6 hours')
  ON CONFLICT (id) DO NOTHING;

EXCEPTION
  WHEN OTHERS THEN
    RAISE NOTICE 'Inventory mock data error: %', SQLERRM;
END $$;
