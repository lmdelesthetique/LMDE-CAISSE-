-- ============================================================
-- Migration: Add remise (discount) columns to reservations
-- ============================================================

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='reservations' AND column_name='remise_type') THEN
    ALTER TABLE public.reservations ADD COLUMN remise_type TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='reservations' AND column_name='remise_valeur') THEN
    ALTER TABLE public.reservations ADD COLUMN remise_valeur DECIMAL(10,2);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='reservations' AND column_name='remise_montant') THEN
    ALTER TABLE public.reservations ADD COLUMN remise_montant DECIMAL(10,2);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='reservations' AND column_name='remise_motif') THEN
    ALTER TABLE public.reservations ADD COLUMN remise_motif TEXT;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_reservations_remise ON public.reservations(remise_montant) WHERE remise_montant IS NOT NULL AND remise_montant > 0;
