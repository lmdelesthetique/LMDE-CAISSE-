-- Champs supplémentaires profil pro : produits, budget, fréquence, besoins
ALTER TABLE public.client_pro_profiles
  ADD COLUMN IF NOT EXISTS produits_utilises  TEXT[]  DEFAULT '{}',   -- multi : gel_x, gel, acrylique, vernis, cils, pedicure, strass, uv, other
  ADD COLUMN IF NOT EXISTS budget_tranche     TEXT    DEFAULT NULL,    -- <100 | 100-200 | 200-300 | 300-500 | +500
  ADD COLUMN IF NOT EXISTS frequence_achat    TEXT    DEFAULT NULL,    -- hebdo | 2x_mois | mensuel | occasionnel
  ADD COLUMN IF NOT EXISTS besoin_principal   TEXT[]  DEFAULT '{}',   -- multi : prix, disponibilite, livraison, qualite, choix, conseil
  ADD COLUMN IF NOT EXISTS fournisseur_actuel TEXT    DEFAULT NULL;   -- local | france | usa | internet | plusieurs
