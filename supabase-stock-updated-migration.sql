-- Add stock_updated flag to fo_orders for idempotent reception stock updates
-- Run in Supabase SQL Editor

alter table fo_orders
  add column if not exists stock_updated boolean default false;

-- Backfill: orders already in stock_integrated status are assumed done
update fo_orders
  set stock_updated = true
  where order_status = 'stock_integrated'
    and stock_updated is false;

-- Optional index for the guard check
create index if not exists idx_fo_orders_stock_updated
  on fo_orders (id, stock_updated);
