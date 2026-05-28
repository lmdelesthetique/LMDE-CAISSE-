-- Add is_favorite column to products table
-- Run in Supabase SQL Editor

alter table products
  add column if not exists is_favorite boolean default false;

-- Optional: index for fast favorites query
create index if not exists idx_products_is_favorite on products (is_favorite)
  where is_favorite = true;
