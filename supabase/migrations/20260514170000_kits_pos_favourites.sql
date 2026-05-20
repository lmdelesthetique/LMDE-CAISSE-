-- ============================================================
-- Kit products + POS favourites migration
-- ============================================================

-- 1. Kit products table
CREATE TABLE IF NOT EXISTS public.product_kits (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id    uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  component_id  uuid NOT NULL REFERENCES public.products(id) ON DELETE RESTRICT,
  quantity      numeric(10,3) NOT NULL DEFAULT 1,
  created_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (product_id, component_id)
);

-- 2. Mark a product as a kit via a column on products
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS is_kit boolean NOT NULL DEFAULT false;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS kit_price_override numeric(12,2);

-- 3. POS favourites table
CREATE TABLE IF NOT EXISTS public.pos_favourites (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id  uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  sort_order  integer NOT NULL DEFAULT 0,
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (product_id)
);

-- 4. RLS
ALTER TABLE public.product_kits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pos_favourites ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'product_kits' AND policyname = 'allow_all_product_kits'
  ) THEN
    CREATE POLICY allow_all_product_kits ON public.product_kits FOR ALL USING (true) WITH CHECK (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'pos_favourites' AND policyname = 'allow_all_pos_favourites'
  ) THEN
    CREATE POLICY allow_all_pos_favourites ON public.pos_favourites FOR ALL USING (true) WITH CHECK (true);
  END IF;
END $$;
