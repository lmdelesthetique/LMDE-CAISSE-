-- ============================================================
-- Migration: Clôture caisse + ticket audit trail
-- ============================================================

-- 1. Ensure receipts table has all needed columns
ALTER TABLE receipts
  ADD COLUMN IF NOT EXISTS ticket_number TEXT,
  ADD COLUMN IF NOT EXISTS client_id UUID REFERENCES clients(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS client_name TEXT,
  ADD COLUMN IF NOT EXISTS cashier_name TEXT,
  ADD COLUMN IF NOT EXISTS items JSONB DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS items_count INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS discount_amount NUMERIC(12,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS subtotal_ht NUMERIC(12,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_tva NUMERIC(12,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_amount NUMERIC(12,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS payment_method TEXT DEFAULT 'other',
  ADD COLUMN IF NOT EXISTS payment_type TEXT DEFAULT 'sale',
  ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'completed',
  ADD COLUMN IF NOT EXISTS notes TEXT,
  ADD COLUMN IF NOT EXISTS loyalty_points_earned INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS loyalty_reward_used TEXT;

-- 2. Ticket modification audit trail
CREATE TABLE IF NOT EXISTS ticket_modifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  receipt_id UUID NOT NULL REFERENCES receipts(id) ON DELETE CASCADE,
  modified_by TEXT NOT NULL,
  modified_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  field_changed TEXT NOT NULL,
  old_value TEXT,
  new_value TEXT,
  reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ticket_modifications_receipt ON ticket_modifications(receipt_id);
CREATE INDEX IF NOT EXISTS idx_ticket_modifications_at ON ticket_modifications(modified_at DESC);

-- 3. Day-end summaries (clôture caisse)
CREATE TABLE IF NOT EXISTS day_summaries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  summary_date DATE NOT NULL,
  cashier_name TEXT,
  total_ca NUMERIC(12,2) DEFAULT 0,
  total_ht NUMERIC(12,2) DEFAULT 0,
  total_tva NUMERIC(12,2) DEFAULT 0,
  total_ttc NUMERIC(12,2) DEFAULT 0,
  gross_margin NUMERIC(12,2) DEFAULT 0,
  gross_margin_rate NUMERIC(6,2) DEFAULT 0,
  ticket_count INTEGER DEFAULT 0,
  avg_basket NUMERIC(12,2) DEFAULT 0,
  payment_breakdown JSONB DEFAULT '{}'::jsonb,
  top_products JSONB DEFAULT '[]'::jsonb,
  top_client TEXT,
  employee_sales JSONB DEFAULT '[]'::jsonb,
  daily_goal NUMERIC(12,2) DEFAULT 0,
  goal_reached BOOLEAN DEFAULT false,
  expenses JSONB DEFAULT '[]'::jsonb,
  total_expenses NUMERIC(12,2) DEFAULT 0,
  cash_out NUMERIC(12,2) DEFAULT 0,
  notes TEXT,
  closed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_day_summaries_date ON day_summaries(summary_date);
CREATE INDEX IF NOT EXISTS idx_day_summaries_cashier ON day_summaries(cashier_name);

-- 4. Daily expenses / cash-out
CREATE TABLE IF NOT EXISTS daily_expenses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  expense_date DATE NOT NULL DEFAULT CURRENT_DATE,
  amount NUMERIC(12,2) NOT NULL,
  category TEXT NOT NULL DEFAULT 'other',
  payment_method TEXT DEFAULT 'cash',
  note TEXT,
  performed_by TEXT,
  receipt_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_daily_expenses_date ON daily_expenses(expense_date);

-- 5. RLS policies
ALTER TABLE ticket_modifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE day_summaries ENABLE ROW LEVEL SECURITY;
ALTER TABLE daily_expenses ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'ticket_modifications' AND policyname = 'allow_all_ticket_modifications') THEN
    CREATE POLICY allow_all_ticket_modifications ON ticket_modifications FOR ALL USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'day_summaries' AND policyname = 'allow_all_day_summaries') THEN
    CREATE POLICY allow_all_day_summaries ON day_summaries FOR ALL USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'daily_expenses' AND policyname = 'allow_all_daily_expenses') THEN
    CREATE POLICY allow_all_daily_expenses ON daily_expenses FOR ALL USING (true) WITH CHECK (true);
  END IF;
END $$;
