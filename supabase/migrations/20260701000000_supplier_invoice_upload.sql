-- Supplier invoice deposit: token + storage URL + received timestamp
ALTER TABLE fo_orders
  ADD COLUMN IF NOT EXISTS invoice_upload_token  TEXT UNIQUE,
  ADD COLUMN IF NOT EXISTS supplier_invoice_path TEXT,
  ADD COLUMN IF NOT EXISTS supplier_invoice_url  TEXT,
  ADD COLUMN IF NOT EXISTS invoice_received_at   TIMESTAMPTZ;

-- Storage bucket for supplier invoices (run once; idempotent via DO block)
DO $$
BEGIN
  INSERT INTO storage.buckets (id, name, public)
  VALUES ('supplier-invoices', 'supplier-invoices', false)
  ON CONFLICT (id) DO NOTHING;
END $$;

-- Allow service role to read/write (anon blocked — uploads go through API route)
CREATE POLICY "service_role_manage_invoices" ON storage.objects
  FOR ALL TO service_role
  USING (bucket_id = 'supplier-invoices')
  WITH CHECK (bucket_id = 'supplier-invoices');
