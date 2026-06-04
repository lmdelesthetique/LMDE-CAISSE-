-- Expeditions (Shopify shipping orders)
CREATE TABLE IF NOT EXISTS public.expeditions (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shopify_order_id      TEXT DEFAULT NULL,
  shopify_order_number  TEXT DEFAULT NULL,
  client_name           TEXT NOT NULL,
  client_phone          TEXT DEFAULT NULL,
  shipping_address      TEXT NOT NULL DEFAULT '',
  carrier               TEXT NOT NULL DEFAULT 'Colissimo',
  tracking_number       TEXT DEFAULT NULL,
  label_printed         BOOLEAN NOT NULL DEFAULT false,
  status                TEXT NOT NULL DEFAULT 'pending',  -- pending | label_generated | shipped | delivered | returned
  products              JSONB DEFAULT '[]'::jsonb,
  total_amount          NUMERIC(10,2) DEFAULT NULL,
  notes                 TEXT DEFAULT NULL,
  shipped_at            TIMESTAMPTZ DEFAULT NULL,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.expeditions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "open_expeditions" ON public.expeditions FOR ALL TO public USING (true) WITH CHECK (true);
CREATE INDEX IF NOT EXISTS idx_expeditions_status ON public.expeditions (status);
CREATE INDEX IF NOT EXISTS idx_expeditions_created ON public.expeditions (created_at DESC);

-- Pickup notifications (click & collect)
CREATE TABLE IF NOT EXISTS public.pickup_notifications (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shopify_order_id      TEXT DEFAULT NULL,
  shopify_order_number  TEXT DEFAULT NULL,
  client_name           TEXT NOT NULL,
  client_phone          TEXT DEFAULT NULL,
  client_email          TEXT DEFAULT NULL,
  products              JSONB DEFAULT '[]'::jsonb,
  total_amount          NUMERIC(10,2) DEFAULT NULL,
  notes                 TEXT DEFAULT NULL,
  status                TEXT NOT NULL DEFAULT 'pending',  -- pending | notified | collected | cancelled
  collected_at          TIMESTAMPTZ DEFAULT NULL,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.pickup_notifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY "open_pickup_notifications" ON public.pickup_notifications FOR ALL TO public USING (true) WITH CHECK (true);
CREATE INDEX IF NOT EXISTS idx_pickup_status ON public.pickup_notifications (status);
CREATE INDEX IF NOT EXISTS idx_pickup_created ON public.pickup_notifications (created_at DESC);
