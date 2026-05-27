-- ─── Portal RLS Policies ──────────────────────────────────────────────────────
-- Run this in Supabase SQL Editor to fix "add to cart" failures
-- and allow the anon role to read products + manage subscription orders.

-- 1. Products: anon can read active products (for client portal catalog)
drop policy if exists "products_portal_anon_read" on products;
create policy "products_portal_anon_read"
  on products for select
  to anon
  using (product_status ilike 'active');

-- 2. Subscription orders: anon can insert + select (portal creates/reads orders)
drop policy if exists "subscription_orders_portal_anon_select" on subscription_orders;
create policy "subscription_orders_portal_anon_select"
  on subscription_orders for select
  to anon
  using (true);

drop policy if exists "subscription_orders_portal_anon_insert" on subscription_orders;
create policy "subscription_orders_portal_anon_insert"
  on subscription_orders for insert
  to anon
  with check (true);

drop policy if exists "subscription_orders_portal_anon_update" on subscription_orders;
create policy "subscription_orders_portal_anon_update"
  on subscription_orders for update
  to anon
  using (true)
  with check (true);

-- 3. Subscription order items: anon can insert + select + delete + update
drop policy if exists "subscription_order_items_portal_anon_select" on subscription_order_items;
create policy "subscription_order_items_portal_anon_select"
  on subscription_order_items for select
  to anon
  using (true);

drop policy if exists "subscription_order_items_portal_anon_insert" on subscription_order_items;
create policy "subscription_order_items_portal_anon_insert"
  on subscription_order_items for insert
  to anon
  with check (true);

drop policy if exists "subscription_order_items_portal_anon_update" on subscription_order_items;
create policy "subscription_order_items_portal_anon_update"
  on subscription_order_items for update
  to anon
  using (true)
  with check (true);

drop policy if exists "subscription_order_items_portal_anon_delete" on subscription_order_items;
create policy "subscription_order_items_portal_anon_delete"
  on subscription_order_items for delete
  to anon
  using (true);

-- 4. Subscription plans: anon can read (portal loads plan data)
drop policy if exists "subscription_plans_portal_anon_read" on subscription_plans;
create policy "subscription_plans_portal_anon_read"
  on subscription_plans for select
  to anon
  using (is_active = true);

-- 5. Categories: anon can read visible categories
drop policy if exists "categories_portal_anon_read" on categories;
create policy "categories_portal_anon_read"
  on categories for select
  to anon
  using (visible_in_client_portal = true and is_active = true);

-- 6. Make sure RLS is enabled on all tables (run even if already enabled)
alter table products enable row level security;
alter table subscription_orders enable row level security;
alter table subscription_order_items enable row level security;
alter table subscription_plans enable row level security;
alter table categories enable row level security;
