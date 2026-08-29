-- Convert main_activity, work_location, fournisseur_actuel to TEXT[] for multi-select
ALTER TABLE public.client_pro_profiles
  ALTER COLUMN main_activity    TYPE TEXT[] USING CASE WHEN main_activity    IS NULL THEN '{}' ELSE ARRAY[main_activity]    END,
  ALTER COLUMN work_location    TYPE TEXT[] USING CASE WHEN work_location    IS NULL THEN '{}' ELSE ARRAY[work_location]    END,
  ALTER COLUMN fournisseur_actuel TYPE TEXT[] USING CASE WHEN fournisseur_actuel IS NULL THEN '{}' ELSE ARRAY[fournisseur_actuel] END;

ALTER TABLE public.client_pro_profiles
  ALTER COLUMN main_activity      SET DEFAULT '{}',
  ALTER COLUMN work_location      SET DEFAULT '{}',
  ALTER COLUMN fournisseur_actuel SET DEFAULT '{}';
