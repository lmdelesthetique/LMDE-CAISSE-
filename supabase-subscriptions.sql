-- ============================================================
-- Système d'abonnements BeautyPOS — Migration Supabase
-- À exécuter dans Supabase > SQL Editor
-- ============================================================

-- 1. Formules d'abonnement
create table if not exists subscription_plans (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,
  price         numeric(10,2) not null,
  quota_amount  numeric(10,2) not null,
  shipping_cost numeric(10,2) not null default 8,
  shipping_free boolean not null default false,
  description   text,
  is_active     boolean not null default true,
  created_at    timestamptz not null default now()
);

insert into subscription_plans (name, price, quota_amount, shipping_cost, shipping_free, description) values
  ('Starter', 89,  110, 8, false, 'Idéal pour commencer — jusqu''à 110 € de produits par mois'),
  ('Pro',    149,  200, 8, false, 'Pour les passionnées — jusqu''à 200 € de produits par mois'),
  ('Elite',  229,  320, 0, true,  'L''expérience ultime — jusqu''à 320 € de produits, livraison offerte')
on conflict do nothing;

-- 2. Nouvelles colonnes sur client_subscriptions
alter table client_subscriptions
  add column if not exists plan_id                uuid references subscription_plans(id),
  add column if not exists pin_code               text,
  add column if not exists portal_phone           text,
  add column if not exists next_billing_date      date,
  add column if not exists gocardless_mandate_id  text;

-- 3. Commandes mensuelles abonnement
create table if not exists subscription_orders (
  id                   uuid primary key default gen_random_uuid(),
  subscription_id      uuid not null references client_subscriptions(id) on delete cascade,
  order_month          text not null,   -- YYYY-MM
  status               text not null default 'open'
                         check (status in ('open','confirmed','preparing','shipped','auto')),
  total_products_cost  numeric(10,2) default 0,
  total_sell_price     numeric(10,2) default 0,
  benefit_amount       numeric(10,2) default 0,
  shipping_cost        numeric(10,2) default 0,
  deadline_date        date,
  created_at           timestamptz not null default now(),
  unique(subscription_id, order_month)
);

-- 4. Produits dans la commande
create table if not exists subscription_order_items (
  id               uuid primary key default gen_random_uuid(),
  order_id         uuid not null references subscription_orders(id) on delete cascade,
  product_id       uuid references products(id),
  color_variant    text,
  quantity         integer not null default 1,
  unit_buy_price   numeric(10,2) default 0,
  unit_sell_price  numeric(10,2) default 0,
  total_sell_price numeric(10,2) default 0,
  created_at       timestamptz not null default now()
);

-- 5. Demandes de reset PIN
create table if not exists pin_reset_requests (
  id         uuid primary key default gen_random_uuid(),
  phone      text not null,
  status     text not null default 'pending' check (status in ('pending','done')),
  created_at timestamptz not null default now()
);

-- 6. RPC verify_client_pin (SECURITY DEFINER — bypass RLS comme verify_supplier_pin)
create or replace function verify_client_pin(p_phone text, p_pin text)
returns table(
  subscription_id uuid,
  client_id       uuid,
  client_name     text,
  plan_name       text,
  plan_price      numeric,
  quota_amount    numeric,
  shipping_free   boolean,
  shipping_cost   numeric
)
language plpgsql security definer set search_path = public
as $$
begin
  return query
    select
      cs.id                                      as subscription_id,
      c.id                                       as client_id,
      (c.first_name || ' ' || c.last_name)::text as client_name,
      sp.name                                    as plan_name,
      sp.price                                   as plan_price,
      sp.quota_amount,
      sp.shipping_free,
      sp.shipping_cost
    from client_subscriptions cs
    join clients c on c.id = cs.client_id
    join subscription_plans sp on sp.id = cs.plan_id
    where cs.portal_phone = trim(p_phone)
      and cs.pin_code     = trim(p_pin)
      and cs.status       = 'active'
      and sp.is_active    = true;
end;
$$;

-- 7. RLS
alter table subscription_plans       enable row level security;
alter table subscription_orders      enable row level security;
alter table subscription_order_items enable row level security;
alter table pin_reset_requests       enable row level security;

-- Lecture publique des formules (affichage dans le portail)
create policy if not exists "Plans — lecture publique"
  on subscription_plans for select using (is_active = true);

-- Insertion anon pour les demandes reset PIN
create policy if not exists "Reset PIN — insertion anon"
  on pin_reset_requests for insert with check (true);

-- Les orders/items sont accédés via RPC depuis le portail (service_role depuis Next.js si besoin)
-- Activer les policies selon votre stratégie RLS (ex. : via RPC SECURITY DEFINER)
