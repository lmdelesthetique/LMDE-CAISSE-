-- ============================================================
-- Delivery Driver Portal — Schema Migration
-- Run once in Supabase SQL editor
-- ============================================================

-- 1. Extend employees table with driver fields
ALTER TABLE employees
  ADD COLUMN IF NOT EXISTS portal_pin TEXT,
  ADD COLUMN IF NOT EXISTS portal_phone TEXT,
  ADD COLUMN IF NOT EXISTS is_delivery_driver BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS driver_status TEXT DEFAULT 'off';

-- 2. Deliveries table
CREATE TABLE IF NOT EXISTS deliveries (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  shopify_order_id TEXT,
  shopify_order_number TEXT,
  client_name TEXT NOT NULL,
  client_phone TEXT,
  delivery_address TEXT NOT NULL,
  delivery_notes TEXT,
  products JSONB,
  total_amount NUMERIC(10,2),
  status TEXT DEFAULT 'pending',
  assigned_to UUID REFERENCES employees(id),
  assigned_at TIMESTAMPTZ,
  en_route_at TIMESTAMPTZ,
  delivered_at TIMESTAMPTZ,
  estimated_time TIMESTAMPTZ,
  signature_url TEXT,
  photo_url TEXT,
  driver_notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS deliveries_status_idx ON deliveries(status);
CREATE INDEX IF NOT EXISTS deliveries_assigned_to_idx ON deliveries(assigned_to);
CREATE INDEX IF NOT EXISTS deliveries_created_at_idx ON deliveries(created_at);

-- 3. Storage bucket for signatures and delivery photos
INSERT INTO storage.buckets (id, name, public)
VALUES ('signatures', 'signatures', true)
ON CONFLICT DO NOTHING;

INSERT INTO storage.buckets (id, name, public)
VALUES ('delivery-photos', 'delivery-photos', true)
ON CONFLICT DO NOTHING;

-- 4. RLS policies (adjust as needed for your security model)
ALTER TABLE deliveries ENABLE ROW LEVEL SECURITY;

-- Allow authenticated users (admin) full access
CREATE POLICY IF NOT EXISTS "Admin full access on deliveries"
  ON deliveries FOR ALL
  USING (true)
  WITH CHECK (true);

-- Storage policies for signatures and photos (public read, any write)
CREATE POLICY IF NOT EXISTS "Public read signatures"
  ON storage.objects FOR SELECT USING (bucket_id = 'signatures');

CREATE POLICY IF NOT EXISTS "Insert signatures"
  ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'signatures');

CREATE POLICY IF NOT EXISTS "Public read delivery-photos"
  ON storage.objects FOR SELECT USING (bucket_id = 'delivery-photos');

CREATE POLICY IF NOT EXISTS "Insert delivery-photos"
  ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'delivery-photos');
