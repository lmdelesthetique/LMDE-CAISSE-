-- Categories (Familles de produits) module

CREATE TABLE IF NOT EXISTS public.categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  color TEXT DEFAULT '#8B5CF6',
  icon TEXT DEFAULT 'TagIcon',
  image_url TEXT,
  is_active BOOLEAN DEFAULT TRUE,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Seed default beauty categories
INSERT INTO public.categories (name, description, color, icon, sort_order) VALUES
  ('Onglerie', 'Produits pour les soins et la décoration des ongles : acrylique, gels, vernis, accessoires', '#EC4899', 'SparklesIcon', 1),
  ('Gel X', 'Capsules et produits Gel X, colles, top coats, kits complets', '#8B5CF6', 'BeakerIcon', 2),
  ('Semi-permanent', 'Vernis semi-permanents, bases, top coats, dissolvants UV', '#F59E0B', 'PaintBrushIcon', 3),
  ('Cils', 'Extensions de cils, colles, pinces, accessoires pose et retrait', '#06B6D4', 'EyeIcon', 4),
  ('Brow Lift', 'Kits brow lift, lotions, papier film, accessoires sourcils', '#10B981', 'StarIcon', 5),
  ('Strass dentaires', 'Strass dentaires, colles spéciales, kits de pose', '#F97316', 'GemIcon', 6),
  ('Mobilier', 'Tables de manucure, sièges clients, chariots, étagères', '#6B7280', 'HomeIcon', 7),
  ('Machines', 'Lampes UV/LED, fraiseuses, aspirateurs de limaille, appareils', '#3B82F6', 'CpuChipIcon', 8),
  ('Consommables', 'Cotons, lingettes, papier aluminium, limes, bâtonnets', '#84CC16', 'ArchiveBoxIcon', 9),
  ('Formations', 'Kits pédagogiques, supports de formation, mannequins', '#A855F7', 'AcademicCapIcon', 10),
  ('Kits débutants', 'Kits complets pour débutantes toutes techniques confondues', '#EF4444', 'GiftIcon', 11),
  ('Kits professionnels', 'Kits avancés pour professionnelles confirmées', '#0EA5E9', 'BriefcaseIcon', 12)
ON CONFLICT DO NOTHING;

-- RLS
ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'categories' AND policyname = 'categories_all'
  ) THEN
    CREATE POLICY categories_all ON public.categories FOR ALL USING (true) WITH CHECK (true);
  END IF;
END $$;
