-- Add category_constraint to loyalty_tiers
-- Used by gift_category_pick reward type to restrict which product category the client can pick

alter table public.loyalty_tiers
  add column if not exists category_constraint text default null;
