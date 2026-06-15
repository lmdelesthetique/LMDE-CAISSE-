-- Ambassadrices system migration
-- Created: 2026-06-15

-- ─── ambassadrices ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.ambassadrices (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  prenom              TEXT NOT NULL,
  nom                 TEXT NOT NULL,
  email               TEXT,
  telephone           TEXT,
  date_entree         DATE DEFAULT CURRENT_DATE,
  grade               TEXT NOT NULL DEFAULT 'debutante' CHECK (grade IN ('debutante', 'confirmee', 'elite')),
  instagram_url       TEXT,
  instagram_followers INTEGER DEFAULT 0,
  tiktok_url          TEXT,
  tiktok_followers    INTEGER DEFAULT 0,
  youtube_url         TEXT,
  autres_reseaux      TEXT,
  google_drive_url    TEXT,
  lien_unique         TEXT UNIQUE NOT NULL,
  notes               TEXT,
  statut              TEXT NOT NULL DEFAULT 'active' CHECK (statut IN ('active', 'inactive', 'suspendue')),
  created_at          TIMESTAMPTZ DEFAULT NOW(),
  updated_at          TIMESTAMPTZ DEFAULT NOW()
);

-- ─── campagnes_ambassadrices ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.campagnes_ambassadrices (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nom         TEXT NOT NULL,
  description TEXT,
  date_debut  DATE,
  date_fin    DATE,
  objectif    TEXT,
  statut      TEXT NOT NULL DEFAULT 'active' CHECK (statut IN ('brouillon', 'active', 'terminee', 'annulee')),
  cout_total  DECIMAL(10,2) DEFAULT 0,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

-- ─── campagne_assignments ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.campagne_assignments (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campagne_id         UUID NOT NULL REFERENCES public.campagnes_ambassadrices(id) ON DELETE CASCADE,
  ambassadrice_id     UUID NOT NULL REFERENCES public.ambassadrices(id) ON DELETE CASCADE,
  products            JSONB DEFAULT '[]',
  statut_reception    TEXT NOT NULL DEFAULT 'en_preparation' CHECK (statut_reception IN ('en_preparation', 'expedie', 'recu', 'confirme')),
  cout_total          DECIMAL(10,2) DEFAULT 0,
  notes               TEXT,
  ai_scripts          JSONB DEFAULT '{}',
  created_at          TIMESTAMPTZ DEFAULT NOW(),
  updated_at          TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(campagne_id, ambassadrice_id)
);

-- ─── campagne_contenus ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.campagne_contenus (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  assignment_id   UUID NOT NULL REFERENCES public.campagne_assignments(id) ON DELETE CASCADE,
  product_id      TEXT,
  product_name    TEXT,
  type_contenu    TEXT NOT NULL DEFAULT 'reel' CHECK (type_contenu IN ('reel', 'story', 'demo', 'temoignage', 'guide')),
  statut          TEXT NOT NULL DEFAULT 'a_faire' CHECK (statut IN ('a_faire', 'en_cours', 'tourne', 'poste')),
  drive_deposited BOOLEAN DEFAULT false,
  notes           TEXT,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

-- ─── RLS ───────────────────────────────────────────────────────────────────────
ALTER TABLE public.ambassadrices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.campagnes_ambassadrices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.campagne_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.campagne_contenus ENABLE ROW LEVEL SECURITY;

-- Drop policies if they exist, then recreate (PG15-compatible)
DO $$ BEGIN
  DROP POLICY IF EXISTS "access_policy" ON public.ambassadrices;
  DROP POLICY IF EXISTS "access_policy" ON public.campagnes_ambassadrices;
  DROP POLICY IF EXISTS "access_policy" ON public.campagne_assignments;
  DROP POLICY IF EXISTS "access_policy" ON public.campagne_contenus;
END $$;

CREATE POLICY "access_policy" ON public.ambassadrices FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "access_policy" ON public.campagnes_ambassadrices FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "access_policy" ON public.campagne_assignments FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "access_policy" ON public.campagne_contenus FOR ALL USING (true) WITH CHECK (true);

-- ─── updated_at trigger ────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_ambassadrices_updated_at') THEN
    CREATE TRIGGER trg_ambassadrices_updated_at
      BEFORE UPDATE ON public.ambassadrices FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_campagnes_ambs_updated_at') THEN
    CREATE TRIGGER trg_campagnes_ambs_updated_at
      BEFORE UPDATE ON public.campagnes_ambassadrices FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_assignments_updated_at') THEN
    CREATE TRIGGER trg_assignments_updated_at
      BEFORE UPDATE ON public.campagne_assignments FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_contenus_updated_at') THEN
    CREATE TRIGGER trg_contenus_updated_at
      BEFORE UPDATE ON public.campagne_contenus FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
  END IF;
END $$;
