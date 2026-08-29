-- Ajout des champs d'activité professionnelle à client_pro_profiles
ALTER TABLE public.client_pro_profiles
  ADD COLUMN IF NOT EXISTS main_activity TEXT DEFAULT NULL,   -- onglerie | cils | pedicure | coiffure | esthetique | strass_dentaires | multi_services
  ADD COLUMN IF NOT EXISTS work_location TEXT DEFAULT NULL,   -- domicile | salon | institut | mobile | location_cabine
  ADD COLUMN IF NOT EXISTS activity_level TEXT DEFAULT NULL;  -- debutante | en_developpement | etablie | gros_volume
