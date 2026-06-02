-- Disable RLS on delivery tables so anon key (browser client) can read/write.
-- Service-role API routes bypass RLS regardless, but this ensures the
-- browser-side Supabase client (real-time subscriptions, driver portal login)
-- also works without permission errors.

ALTER TABLE drivers    DISABLE ROW LEVEL SECURITY;
ALTER TABLE deliveries DISABLE ROW LEVEL SECURITY;

-- Ensure all required columns exist (idempotent)
ALTER TABLE drivers
  ADD COLUMN IF NOT EXISTS first_name    TEXT,
  ADD COLUMN IF NOT EXISTS last_name     TEXT,
  ADD COLUMN IF NOT EXISTS pin_code      TEXT,
  ADD COLUMN IF NOT EXISTS status        TEXT DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS driver_status TEXT DEFAULT 'off',
  ADD COLUMN IF NOT EXISTS notes         TEXT;

ALTER TABLE deliveries
  ADD COLUMN IF NOT EXISTS assigned_to_driver UUID REFERENCES drivers(id),
  ADD COLUMN IF NOT EXISTS status             TEXT DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS client_name        TEXT,
  ADD COLUMN IF NOT EXISTS client_phone       TEXT,
  ADD COLUMN IF NOT EXISTS delivery_address   TEXT,
  ADD COLUMN IF NOT EXISTS products           JSONB,
  ADD COLUMN IF NOT EXISTS total_amount       NUMERIC(10,2),
  ADD COLUMN IF NOT EXISTS delivery_notes     TEXT,
  ADD COLUMN IF NOT EXISTS shopify_order_id   TEXT,
  ADD COLUMN IF NOT EXISTS assigned_at        TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS en_route_at        TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS delivered_at       TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS driver_notes       TEXT,
  ADD COLUMN IF NOT EXISTS signature_url      TEXT,
  ADD COLUMN IF NOT EXISTS photo_url          TEXT;
