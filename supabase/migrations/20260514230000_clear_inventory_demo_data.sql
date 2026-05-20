-- ============================================================
-- Clear demo/seed data from inventory tables
-- User request: "VIDE LES INFOS DANS L'INVENTAIRE"
-- ============================================================

DO $$
BEGIN
  -- Clear inventory stock levels (child table first)
  DELETE FROM public.inventory_stock_levels;

  -- Clear inventory products (parent table)
  DELETE FROM public.inventory_products;

  -- Clear inventory movements
  DELETE FROM public.inventory_movements;

  RAISE NOTICE 'Inventory demo data cleared successfully';
EXCEPTION
  WHEN OTHERS THEN
    RAISE NOTICE 'Inventory clear failed: %', SQLERRM;
END $$;
