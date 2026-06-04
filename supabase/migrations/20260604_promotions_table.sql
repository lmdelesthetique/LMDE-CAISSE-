CREATE TABLE IF NOT EXISTS public.promotions (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name            TEXT NOT NULL,
  type            TEXT NOT NULL DEFAULT 'discount', -- 'discount' | 'bundle' | 'bogo'
  discount_type   TEXT DEFAULT NULL,                -- 'percent' | 'amount'
  discount_value  NUMERIC(10,2) DEFAULT NULL,
  bundle_price    NUMERIC(10,2) DEFAULT NULL,
  products        JSONB DEFAULT '[]'::jsonb,
  is_active       BOOLEAN NOT NULL DEFAULT true,
  starts_at       TIMESTAMPTZ DEFAULT NULL,
  ends_at         TIMESTAMPTZ DEFAULT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.promotions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "open_promotions" ON public.promotions FOR ALL TO public USING (true) WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_promotions_active ON public.promotions (is_active);
