-- Add driver invoice tracking columns to deliveries table
ALTER TABLE deliveries
  ADD COLUMN IF NOT EXISTS driver_fee        numeric,
  ADD COLUMN IF NOT EXISTS driver_invoice_url text,
  ADD COLUMN IF NOT EXISTS driver_invoice_paid boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS driver_invoice_paid_at timestamptz;

-- Also create the driver-invoices storage bucket if it doesn't exist
-- (run this separately in Supabase dashboard > Storage if needed)
-- INSERT INTO storage.buckets (id, name, public) VALUES ('driver-invoices', 'driver-invoices', true)
-- ON CONFLICT (id) DO NOTHING;
