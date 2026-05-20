-- Migration: Product image upload + color variant stock tracking
-- Timestamp: 20260506170000

-- 1. Create storage bucket for product images (via SQL)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'product-images',
  'product-images',
  true,
  5242880,
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif']
)
ON CONFLICT (id) DO NOTHING;

-- Storage policies for product-images bucket
DROP POLICY IF EXISTS "product_images_public_read" ON storage.objects;
CREATE POLICY "product_images_public_read"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'product-images');

DROP POLICY IF EXISTS "product_images_authenticated_upload" ON storage.objects;
CREATE POLICY "product_images_authenticated_upload"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'product-images');

DROP POLICY IF EXISTS "product_images_authenticated_update" ON storage.objects;
CREATE POLICY "product_images_authenticated_update"
ON storage.objects FOR UPDATE
TO authenticated
USING (bucket_id = 'product-images');

DROP POLICY IF EXISTS "product_images_authenticated_delete" ON storage.objects;
CREATE POLICY "product_images_authenticated_delete"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'product-images');

-- 2. Create products table (main catalog)
CREATE TABLE IF NOT EXISTS public.products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ref TEXT NOT NULL,
  barcode TEXT,
  name TEXT NOT NULL,
  category TEXT,
  supplier TEXT,
  buy_price NUMERIC DEFAULT 0,
  transport NUMERIC DEFAULT 0,
  customs NUMERIC DEFAULT 0,
  other_fees NUMERIC DEFAULT 0,
  cost_price NUMERIC GENERATED ALWAYS AS (buy_price + transport + customs + other_fees) STORED,
  sell_price_ht NUMERIC DEFAULT 0,
  tva NUMERIC DEFAULT 8.5,
  sell_price_ttc NUMERIC GENERATED ALWAYS AS (sell_price_ht * (1 + (8.5 / 100))) STORED,
  min_stock INTEGER DEFAULT 5,
  location TEXT,
  status TEXT DEFAULT 'active',
  shopify BOOLEAN DEFAULT false,
  reservable BOOLEAN DEFAULT true,
  sellable BOOLEAN DEFAULT true,
  description TEXT,
  image_url TEXT,
  has_color_variants BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_products_ref ON public.products(ref);
CREATE INDEX IF NOT EXISTS idx_products_category ON public.products(category);
CREATE INDEX IF NOT EXISTS idx_products_status ON public.products(status);

-- 3. Create product_color_stock table for per-color inventory
CREATE TABLE IF NOT EXISTS public.product_color_stock (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  color_name TEXT NOT NULL,
  color_hex TEXT,
  quantity INTEGER DEFAULT 0,
  min_stock INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_product_color_stock_product_id ON public.product_color_stock(product_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_product_color_stock_unique ON public.product_color_stock(product_id, color_name);

-- 4. Enable RLS
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_color_stock ENABLE ROW LEVEL SECURITY;

-- 5. RLS Policies - open access (POS app, no per-user ownership)
DROP POLICY IF EXISTS "products_open_access" ON public.products;
CREATE POLICY "products_open_access"
ON public.products FOR ALL
TO public
USING (true)
WITH CHECK (true);

DROP POLICY IF EXISTS "product_color_stock_open_access" ON public.product_color_stock;
CREATE POLICY "product_color_stock_open_access"
ON public.product_color_stock FOR ALL
TO public
USING (true)
WITH CHECK (true);

-- 6. Updated_at trigger function
CREATE OR REPLACE FUNCTION public.update_products_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS products_updated_at ON public.products;
CREATE TRIGGER products_updated_at
BEFORE UPDATE ON public.products
FOR EACH ROW EXECUTE FUNCTION public.update_products_updated_at();

DROP TRIGGER IF EXISTS product_color_stock_updated_at ON public.product_color_stock;
CREATE TRIGGER product_color_stock_updated_at
BEFORE UPDATE ON public.product_color_stock
FOR EACH ROW EXECUTE FUNCTION public.update_products_updated_at();
