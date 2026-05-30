-- ============================================================
-- Migration: Caisse sessions (fond de caisse)
-- ============================================================

CREATE TABLE IF NOT EXISTS public.caisse_sessions (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  date                    DATE NOT NULL,
  caissier_name           TEXT,
  heure_ouverture         TIMESTAMPTZ NOT NULL DEFAULT now(),
  fond_ouverture          DECIMAL(10,2) NOT NULL DEFAULT 0,
  fond_detail_ouverture   JSONB,
  heure_cloture           TIMESTAMPTZ,
  fond_compte             DECIMAL(10,2),
  fond_theorique          DECIMAL(10,2),
  ecart                   DECIMAL(10,2),
  fond_demain             DECIMAL(10,2),
  montant_a_deposer       DECIMAL(10,2),
  statut                  TEXT NOT NULL DEFAULT 'ouverte',
  created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_caisse_sessions_date
  ON public.caisse_sessions(date)
  WHERE statut = 'ouverte';

CREATE INDEX IF NOT EXISTS idx_caisse_sessions_date_all
  ON public.caisse_sessions(date DESC);

ALTER TABLE public.caisse_sessions ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'caisse_sessions'
    AND policyname = 'allow_all_caisse_sessions'
  ) THEN
    CREATE POLICY allow_all_caisse_sessions
      ON public.caisse_sessions FOR ALL
      USING (true) WITH CHECK (true);
  END IF;
END $$;
