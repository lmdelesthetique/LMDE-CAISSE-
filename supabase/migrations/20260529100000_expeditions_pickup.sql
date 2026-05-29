-- Expeditions (Colissimo / standard shipping)
create table if not exists expeditions (
  id uuid primary key default gen_random_uuid(),
  shopify_order_id text unique,
  shopify_order_number text,
  client_name text not null,
  client_phone text,
  shipping_address text not null,
  carrier text not null default 'Colissimo',
  tracking_number text,
  label_printed boolean not null default false,
  status text not null default 'pending' check (status in ('pending','label_generated','shipped','delivered','returned')),
  products jsonb,
  total_amount numeric,
  notes text,
  shipped_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table expeditions enable row level security;
create policy "Authenticated full access on expeditions"
  on expeditions for all to authenticated using (true) with check (true);

-- Pickup notifications (retrait en magasin)
create table if not exists pickup_notifications (
  id uuid primary key default gen_random_uuid(),
  shopify_order_id text unique,
  shopify_order_number text,
  client_name text not null,
  client_phone text,
  client_email text,
  products jsonb,
  total_amount numeric,
  notes text,
  status text not null default 'pending' check (status in ('pending','notified','collected','cancelled')),
  collected_at timestamptz,
  created_at timestamptz not null default now()
);

alter table pickup_notifications enable row level security;
create policy "Authenticated full access on pickup_notifications"
  on pickup_notifications for all to authenticated using (true) with check (true);

-- Index for lookups
create index if not exists idx_expeditions_status on expeditions(status);
create index if not exists idx_expeditions_created_at on expeditions(created_at desc);
create index if not exists idx_pickup_notifications_status on pickup_notifications(status);
