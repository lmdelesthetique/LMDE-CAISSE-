-- ============================================================
-- Migration: Complete receipts setup + ticket_settings table
-- ============================================================

-- 1. Create receipts table if it does not exist
CREATE TABLE IF NOT EXISTS public.receipts (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_number   TEXT,
  client_id       UUID REFERENCES public.clients(id) ON DELETE SET NULL,
  client_name     TEXT,
  cashier_name    TEXT,
  items           JSONB DEFAULT '[]'::jsonb,
  items_count     INTEGER DEFAULT 0,
  subtotal_ht     NUMERIC(12,2) DEFAULT 0,
  total_tva       NUMERIC(12,2) DEFAULT 0,
  total_amount    NUMERIC(12,2) NOT NULL DEFAULT 0,
  discount_amount NUMERIC(12,2) DEFAULT 0,
  payment_method  TEXT DEFAULT 'other',
  payment_type    TEXT DEFAULT 'sale',
  status          TEXT NOT NULL DEFAULT 'completed',
  notes           TEXT,
  loyalty_points_earned INTEGER DEFAULT 0,
  loyalty_reward_used   TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. Add missing columns to existing receipts table
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='receipts' AND column_name='subtotal_ht') THEN
    ALTER TABLE public.receipts ADD COLUMN subtotal_ht NUMERIC(12,2) DEFAULT 0; END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='receipts' AND column_name='total_tva') THEN
    ALTER TABLE public.receipts ADD COLUMN total_tva NUMERIC(12,2) DEFAULT 0; END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='receipts' AND column_name='payment_type') THEN
    ALTER TABLE public.receipts ADD COLUMN payment_type TEXT DEFAULT 'sale'; END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='receipts' AND column_name='loyalty_points_earned') THEN
    ALTER TABLE public.receipts ADD COLUMN loyalty_points_earned INTEGER DEFAULT 0; END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='receipts' AND column_name='loyalty_reward_used') THEN
    ALTER TABLE public.receipts ADD COLUMN loyalty_reward_used TEXT; END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='receipts' AND column_name='cashier_name') THEN
    ALTER TABLE public.receipts ADD COLUMN cashier_name TEXT; END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='receipts' AND column_name='client_name') THEN
    ALTER TABLE public.receipts ADD COLUMN client_name TEXT; END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='receipts' AND column_name='items_count') THEN
    ALTER TABLE public.receipts ADD COLUMN items_count INTEGER DEFAULT 0; END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='receipts' AND column_name='items') THEN
    ALTER TABLE public.receipts ADD COLUMN items JSONB DEFAULT '[]'::jsonb; END IF;
END $$;

-- 3. RLS for receipts
ALTER TABLE public.receipts ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='receipts' AND policyname='allow_all_receipts') THEN
    CREATE POLICY allow_all_receipts ON public.receipts FOR ALL USING (true) WITH CHECK (true);
  END IF;
END $$;

-- 4. Ticket modifications audit table
CREATE TABLE IF NOT EXISTS public.ticket_modifications (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  receipt_id    UUID NOT NULL REFERENCES public.receipts(id) ON DELETE CASCADE,
  modified_by   TEXT NOT NULL,
  modified_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  field_changed TEXT NOT NULL,
  old_value     TEXT,
  new_value     TEXT,
  reason        TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.ticket_modifications ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='ticket_modifications' AND policyname='allow_all_ticket_modifications') THEN
    CREATE POLICY allow_all_ticket_modifications ON public.ticket_modifications FOR ALL USING (true) WITH CHECK (true);
  END IF;
END $$;

-- 5. Ticket settings table (single row id=1)
CREATE TABLE IF NOT EXISTS public.ticket_settings (
  id                  INT PRIMARY KEY DEFAULT 1,
  header_text         TEXT,
  footer_text         TEXT,
  thank_you_message   TEXT,
  paper_width         TEXT DEFAULT '80mm',
  font_size           TEXT DEFAULT 'medium',
  show_logo           BOOLEAN DEFAULT true,
  show_tva_detail     BOOLEAN DEFAULT true,
  show_barcode        BOOLEAN DEFAULT true,
  show_loyalty_points BOOLEAN DEFAULT true,
  show_next_tier      BOOLEAN DEFAULT true,
  updated_at          TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE public.ticket_settings ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='ticket_settings' AND policyname='allow_all_ticket_settings') THEN
    CREATE POLICY allow_all_ticket_settings ON public.ticket_settings FOR ALL USING (true) WITH CHECK (true);
  END IF;
END $$;

-- 6. Indexes
CREATE INDEX IF NOT EXISTS idx_receipts_created_at     ON public.receipts(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_receipts_payment_method ON public.receipts(payment_method);
CREATE INDEX IF NOT EXISTS idx_receipts_status         ON public.receipts(status);
CREATE INDEX IF NOT EXISTS idx_receipts_cashier_name   ON public.receipts(cashier_name);
CREATE INDEX IF NOT EXISTS idx_ticket_mods_receipt     ON public.ticket_modifications(receipt_id);
CREATE INDEX IF NOT EXISTS idx_ticket_mods_at          ON public.ticket_modifications(modified_at DESC);
