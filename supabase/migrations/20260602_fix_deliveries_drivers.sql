-- ============================================================
-- Fix deliveries + drivers tables — idempotent, run any time
-- Run in Supabase SQL Editor → Dashboard → SQL Editor
-- ============================================================

-- 1. drivers table (standalone, no employee dependency)
CREATE TABLE IF NOT EXISTS drivers (
  id            UUID    DEFAULT gen_random_uuid() PRIMARY KEY,
  first_name    TEXT    NOT NULL,
  last_name     TEXT    NOT NULL,
  phone         TEXT    NOT NULL UNIQUE,
  pin_code      TEXT    NOT NULL,
  status        TEXT    DEFAULT 'active',
  driver_status TEXT    DEFAULT 'off',
  notes         TEXT,
  created_at    TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE drivers DISABLE ROW LEVEL SECURITY;

-- 2. deliveries table — create from scratch if missing
CREATE TABLE IF NOT EXISTS deliveries (
  id                  UUID    DEFAULT gen_random_uuid() PRIMARY KEY,
  shopify_order_id    TEXT,
  shopify_order_number TEXT,
  client_name         TEXT    NOT NULL,
  client_phone        TEXT,
  delivery_address    TEXT    NOT NULL,
  delivery_notes      TEXT,
  products            JSONB,
  total_amount        NUMERIC(10,2),
  status              TEXT    DEFAULT 'pending',
  assigned_to_driver  UUID    REFERENCES drivers(id),
  assigned_at         TIMESTAMPTZ,
  en_route_at         TIMESTAMPTZ,
  delivered_at        TIMESTAMPTZ,
  estimated_time      TIMESTAMPTZ,
  signature_url       TEXT,
  photo_url           TEXT,
  driver_notes        TEXT,
  created_at          TIMESTAMPTZ DEFAULT now()
);

-- 3. If deliveries already existed with the OLD assigned_to column (employees FK),
--    drop that and add the new assigned_to_driver column pointing at drivers.
ALTER TABLE deliveries DROP COLUMN IF EXISTS assigned_to;
ALTER TABLE deliveries ADD COLUMN IF NOT EXISTS assigned_to_driver UUID REFERENCES drivers(id);

-- 4. Indexes
CREATE INDEX IF NOT EXISTS deliveries_status_idx           ON deliveries(status);
CREATE INDEX IF NOT EXISTS idx_deliveries_assigned_to_driver ON deliveries(assigned_to_driver);
CREATE INDEX IF NOT EXISTS deliveries_created_at_idx       ON deliveries(created_at);

-- 5. RLS — open policies so anon key (browser client) can read/write
ALTER TABLE deliveries DISABLE ROW LEVEL SECURITY;

-- 6. Storage buckets for signatures and delivery photos
INSERT INTO storage.buckets (id, name, public)
VALUES ('signatures', 'signatures', true)
ON CONFLICT DO NOTHING;

INSERT INTO storage.buckets (id, name, public)
VALUES ('delivery-photos', 'delivery-photos', true)
ON CONFLICT DO NOTHING;

-- Storage policies (safe to re-run — CREATE POLICY errors if already exists,
-- so we use DO $$ blocks to skip duplicates)
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'objects' AND policyname = 'Public read signatures'
  ) THEN
    CREATE POLICY "Public read signatures"
      ON storage.objects FOR SELECT USING (bucket_id = 'signatures');
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'objects' AND policyname = 'Insert signatures'
  ) THEN
    CREATE POLICY "Insert signatures"
      ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'signatures');
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'objects' AND policyname = 'Public read delivery-photos'
  ) THEN
    CREATE POLICY "Public read delivery-photos"
      ON storage.objects FOR SELECT USING (bucket_id = 'delivery-photos');
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'objects' AND policyname = 'Insert delivery-photos'
  ) THEN
    CREATE POLICY "Insert delivery-photos"
      ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'delivery-photos');
  END IF;
END $$;
