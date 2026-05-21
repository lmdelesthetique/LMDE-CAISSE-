-- Add structure_pct column to products table
-- Used to include overhead costs (rent, salaries, charges) in real cost calculation
-- Real cost = (buy_price + transport + customs + other_fees) × (1 + structure_pct / 100)

ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS structure_pct NUMERIC(5,2) DEFAULT 0;

COMMENT ON COLUMN public.products.structure_pct IS 'Overhead cost percentage applied on top of base cost (loyer, salaires, charges fixes). Real cost = baseCost × (1 + structure_pct/100).';
