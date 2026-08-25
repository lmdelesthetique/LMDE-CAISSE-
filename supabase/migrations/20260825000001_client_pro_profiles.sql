-- Fiche Pro : profil salon pour les clients professionnels
create table if not exists public.client_pro_profiles (
  id uuid primary key default gen_random_uuid(),
  client_id uuid unique not null references public.clients(id) on delete cascade,

  -- Section 1 : Profil salon
  salon_name text,
  prestation_types text[],          -- onglerie, extension_cils, pedicure, esthetique, autre
  nb_cabines integer,
  nb_clientes_semaine integer,
  nb_employes integer,

  -- Section 2 : Budget & habitudes
  budget_mensuel numeric,
  fournisseur_principal text,
  frequence_commande text,          -- hebdo | bi_mensuel | mensuel
  mode_commande text,               -- boutique | whatsapp | en_ligne

  -- Section 3 : Produits
  marques_utilisees text,
  produits_consommables text,
  produits_recherches text,
  problemes_fournisseurs text,

  -- Section 4 : Proposition MDLE
  formule_box_proposee text,        -- 200 | 400 | 700
  date_premier_contact date,
  statut_commercial text default 'prospect', -- prospect | devis_envoye | contrat_signe | actif
  prochain_suivi date,

  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table public.client_pro_profiles enable row level security;

create policy "Service role full access" on public.client_pro_profiles
  using (true) with check (true);
