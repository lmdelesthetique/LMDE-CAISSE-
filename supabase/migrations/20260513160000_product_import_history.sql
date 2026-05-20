-- Product Import History & Demo Data Cleanup
-- Migration: 20260513160000_product_import_history.sql

CREATE TABLE IF NOT EXISTS public.product_import_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  imported_at TIMESTAMPTZ DEFAULT now(),
  file_name TEXT NOT NULL,
  imported_by TEXT DEFAULT 'admin',
  total_detected INTEGER DEFAULT 0,
  total_created INTEGER DEFAULT 0,
  total_updated INTEGER DEFAULT 0,
  total_duplicates INTEGER DEFAULT 0,
  total_errors INTEGER DEFAULT 0,
  total_barcodes_replaced INTEGER DEFAULT 0,
  details JSONB DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_product_import_history_imported_at
  ON public.product_import_history(imported_at DESC);

ALTER TABLE public.product_import_history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "open_access_product_import_history" ON public.product_import_history;
CREATE POLICY "open_access_product_import_history"
  ON public.product_import_history
  FOR ALL
  TO public
  USING (true)
  WITH CHECK (true);
