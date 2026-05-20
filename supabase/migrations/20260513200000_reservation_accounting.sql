-- Reservation Accounting: balance_paid, accounting fields, stats view
-- Migration: 20260513200000_reservation_accounting.sql

-- Add balance_paid column to track when client pays the remaining balance
ALTER TABLE public.reservations
  ADD COLUMN IF NOT EXISTS balance_paid NUMERIC(10,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS balance_paid_at TIMESTAMPTZ DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS balance_payment_method TEXT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS deposit_accounting_date DATE DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS balance_accounting_date DATE DEFAULT NULL;

-- Index for accounting queries
CREATE INDEX IF NOT EXISTS idx_reservations_deposit_accounting ON public.reservations(deposit_accounting_date);
CREATE INDEX IF NOT EXISTS idx_reservations_balance_accounting ON public.reservations(balance_accounting_date);

-- View: reservation accounting summary per day (no double counting)
CREATE OR REPLACE VIEW public.reservation_daily_accounting AS
SELECT
  COALESCE(deposit_accounting_date, DATE(created_at)) AS accounting_date,
  COUNT(*) FILTER (WHERE deposit_paid > 0) AS reservations_with_deposit,
  SUM(deposit_paid) AS deposits_collected,
  SUM(balance_paid) AS balances_collected,
  SUM(deposit_paid + balance_paid) AS total_collected,
  SUM(total_amount - deposit_paid - balance_paid) FILTER (WHERE reservation_status NOT IN ('cancelled', 'completed')) AS pending_balance
FROM public.reservations
WHERE reservation_status != 'cancelled'
GROUP BY COALESCE(deposit_accounting_date, DATE(created_at));

-- Update existing deposit_paid records to set accounting date
UPDATE public.reservations
SET deposit_accounting_date = DATE(deposit_paid_at)
WHERE deposit_paid > 0 AND deposit_paid_at IS NOT NULL AND deposit_accounting_date IS NULL;
