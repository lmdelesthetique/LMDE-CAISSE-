-- Migration: Alma payment method, annual bonus tracking, and cash register history enhancements
-- Timestamp: 20260514120000

-- ─── 0. Create receipts table if it does not exist ───────────────────────────
CREATE TABLE IF NOT EXISTS public.receipts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_number TEXT,
  client_id UUID REFERENCES public.clients(id) ON DELETE SET NULL,
  client_name TEXT,
  total_amount NUMERIC(10,2) NOT NULL DEFAULT 0,
  payment_method TEXT,
  status TEXT NOT NULL DEFAULT 'completed',
  cashier_name TEXT,
  discount_amount NUMERIC(10,2) DEFAULT 0,
  items_count INTEGER DEFAULT 0,
  items JSONB,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.receipts ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'receipts' AND policyname = 'allow_all_receipts'
  ) THEN
    CREATE POLICY allow_all_receipts ON public.receipts FOR ALL USING (true) WITH CHECK (true);
  END IF;
END $$;

-- ─── 1. Add Alma payment method support to receipts ──────────────────────────
DO $$
BEGIN
  COMMENT ON TABLE receipts IS 'POS receipts — supports payment methods: SumUp (CB), Espèces, Virement, Mixte, Alma (3x/4x)';
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- ─── 2. Add cashier_name and discount_amount to receipts if missing ───────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'receipts' AND column_name = 'cashier_name'
  ) THEN
    ALTER TABLE public.receipts ADD COLUMN cashier_name TEXT;
  END IF;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'receipts' AND column_name = 'discount_amount'
  ) THEN
    ALTER TABLE public.receipts ADD COLUMN discount_amount NUMERIC(10,2) DEFAULT 0;
  END IF;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'receipts' AND column_name = 'items_count'
  ) THEN
    ALTER TABLE public.receipts ADD COLUMN items_count INTEGER DEFAULT 0;
  END IF;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- ─── 3. Annual bonus tracking table ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.employee_annual_bonus (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id UUID NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  year INTEGER NOT NULL,
  annual_target NUMERIC(10,2) NOT NULL DEFAULT 0,
  annual_revenue NUMERIC(10,2) NOT NULL DEFAULT 0,
  bonus_amount NUMERIC(10,2) NOT NULL DEFAULT 0,
  bonus_paid BOOLEAN NOT NULL DEFAULT false,
  bonus_paid_at TIMESTAMPTZ,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(employee_id, year)
);

ALTER TABLE public.employee_annual_bonus ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'employee_annual_bonus' AND policyname = 'allow_all_employee_annual_bonus'
  ) THEN
    CREATE POLICY allow_all_employee_annual_bonus ON public.employee_annual_bonus FOR ALL USING (true) WITH CHECK (true);
  END IF;
END $$;

-- ─── 4. Client reminders log table ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.client_reminders_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID REFERENCES public.clients(id) ON DELETE SET NULL,
  reservation_id UUID REFERENCES public.reservations(id) ON DELETE SET NULL,
  reminder_type TEXT NOT NULL CHECK (reminder_type IN ('balance_due', 'birthday', 'inactive')),
  sent_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  sent_via TEXT CHECK (sent_via IN ('email', 'phone', 'whatsapp', 'manual')),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.client_reminders_log ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'client_reminders_log' AND policyname = 'allow_all_client_reminders_log'
  ) THEN
    CREATE POLICY allow_all_client_reminders_log ON public.client_reminders_log FOR ALL USING (true) WITH CHECK (true);
  END IF;
END $$;

-- ─── 5. Index for cash register history queries ───────────────────────────────
CREATE INDEX IF NOT EXISTS idx_receipts_created_at ON public.receipts(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_receipts_payment_method ON public.receipts(payment_method);
CREATE INDEX IF NOT EXISTS idx_receipts_status ON public.receipts(status);
CREATE INDEX IF NOT EXISTS idx_receipts_cashier_name ON public.receipts(cashier_name);

-- ─── 7. Index for reservation balance queries ─────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_reservations_balance_due ON public.reservations(balance_due) WHERE balance_due > 0;
CREATE INDEX IF NOT EXISTS idx_reservations_status_created ON public.reservations(reservation_status, created_at);
