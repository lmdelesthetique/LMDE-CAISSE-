-- Add 'realise' to campagne_contenus statut check constraint
ALTER TABLE public.campagne_contenus DROP CONSTRAINT IF EXISTS campagne_contenus_statut_check;
ALTER TABLE public.campagne_contenus ADD CONSTRAINT campagne_contenus_statut_check
  CHECK (statut IN ('a_faire', 'en_cours', 'tourne', 'poste', 'realise'));
