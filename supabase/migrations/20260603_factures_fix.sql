-- Ensure factures table exists with all required columns
CREATE TABLE IF NOT EXISTS factures (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  numero TEXT NOT NULL,
  doc_type TEXT NOT NULL DEFAULT 'facture' CHECK (doc_type IN ('facture', 'devis')),
  client_name TEXT,
  client_email TEXT,
  items JSONB NOT NULL DEFAULT '[]'::jsonb,
  total_ht NUMERIC(12,2) NOT NULL DEFAULT 0,
  total_tva NUMERIC(12,2) NOT NULL DEFAULT 0,
  total_ttc NUMERIC(12,2) NOT NULL DEFAULT 0,
  tva_rate NUMERIC(5,2) NOT NULL DEFAULT 8.5,
  payment_method TEXT,
  status TEXT NOT NULL DEFAULT 'payee',
  receipt_ref TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Add is_counted_in_ca: false for devis, true for factures
ALTER TABLE factures
  ADD COLUMN IF NOT EXISTS is_counted_in_ca BOOLEAN NOT NULL DEFAULT true;

-- Update existing devis rows so they are NOT counted in CA
UPDATE factures SET is_counted_in_ca = false WHERE doc_type = 'devis' AND is_counted_in_ca = true;

-- Enable RLS (all writes go through API routes with service role key)
ALTER TABLE factures ENABLE ROW LEVEL SECURITY;

-- Open read/write policy — service role bypasses RLS entirely;
-- anon reads are needed for the B2B page query
DROP POLICY IF EXISTS "access_policy" ON factures;
CREATE POLICY "access_policy" ON factures
  FOR ALL
  USING (true)
  WITH CHECK (true);
