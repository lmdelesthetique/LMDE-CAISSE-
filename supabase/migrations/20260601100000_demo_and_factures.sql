-- Add is_demo flag to products table
ALTER TABLE products ADD COLUMN IF NOT EXISTS is_demo BOOLEAN DEFAULT FALSE;

-- Insert PRODUIT FORMATION (idempotent)
INSERT INTO products (name, ref, sell_price_ttc, buy_price, category, status, is_demo, description)
SELECT 'PRODUIT FORMATION', 'DEMO-001', 0.01, 0, 'FORMATION', 'actif', true,
       'Produit test pour formation caissier — ne compte pas dans le CA'
WHERE NOT EXISTS (SELECT 1 FROM products WHERE ref = 'DEMO-001');

-- Add is_demo flag to receipts table
ALTER TABLE receipts ADD COLUMN IF NOT EXISTS is_demo BOOLEAN DEFAULT FALSE;

-- Create factures table for invoices and quotes generated from POS
CREATE TABLE IF NOT EXISTS factures (
  id          UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  numero      TEXT          NOT NULL,
  doc_type    TEXT          NOT NULL DEFAULT 'facture' CHECK (doc_type IN ('facture', 'devis')),
  client_name TEXT,
  client_email TEXT,
  items       JSONB         NOT NULL DEFAULT '[]'::jsonb,
  total_ht    NUMERIC(12,2) NOT NULL DEFAULT 0,
  total_tva   NUMERIC(12,2) NOT NULL DEFAULT 0,
  total_ttc   NUMERIC(12,2) NOT NULL DEFAULT 0,
  tva_rate    NUMERIC(5,2)  NOT NULL DEFAULT 8.5,
  payment_method TEXT,
  status      TEXT          NOT NULL DEFAULT 'payee',
  receipt_ref TEXT,
  created_at  TIMESTAMPTZ  NOT NULL DEFAULT now()
);

ALTER TABLE factures ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "allow_all_factures" ON factures;
CREATE POLICY "allow_all_factures" ON factures
  FOR ALL USING (true) WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_factures_created_at ON factures(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_factures_doc_type   ON factures(doc_type);
