-- Add deposits JSONB array to store multiple deposit entries
-- Each entry: { id, amount, method, paid_at, accounting_date, cashier_name }
ALTER TABLE reservations
  ADD COLUMN IF NOT EXISTS deposits JSONB DEFAULT '[]'::jsonb;

-- Backfill: any reservation with deposit_paid > 0 gets a synthetic first entry
UPDATE reservations
SET deposits = jsonb_build_array(
  jsonb_build_object(
    'id',              gen_random_uuid()::text,
    'amount',          deposit_paid,
    'method',          COALESCE(deposit_payment_method, 'cash'),
    'paid_at',         COALESCE(deposit_paid_at, created_at),
    'accounting_date', COALESCE(deposit_accounting_date, (created_at::date)::text),
    'cashier_name',    COALESCE(cashier_name, 'Caisse')
  )
)
WHERE deposit_paid > 0 AND (deposits IS NULL OR deposits = '[]'::jsonb);
