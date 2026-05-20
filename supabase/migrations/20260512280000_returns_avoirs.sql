-- Returns & Avoirs Module
-- Timestamp: 20260512280000

-- Enum for return reason
DROP TYPE IF EXISTS public.return_reason CASCADE;
CREATE TYPE public.return_reason AS ENUM (
  'defective',
  'wrong_product',
  'not_satisfied',
  'size_issue',
  'damaged_delivery',
  'other'
);

-- Enum for refund type
DROP TYPE IF EXISTS public.return_refund_type CASCADE;
CREATE TYPE public.return_refund_type AS ENUM (
  'refund_cash',
  'refund_card',
  'store_credit',
  'exchange'
);

-- Enum for return status
DROP TYPE IF EXISTS public.return_status CASCADE;
CREATE TYPE public.return_status AS ENUM (
  'pending',
  'approved',
  'rejected',
  'completed'
);

-- Avoir number sequence
CREATE SEQUENCE IF NOT EXISTS public.avoir_number_seq START 1001 INCREMENT 1;

-- Returns table
CREATE TABLE IF NOT EXISTS public.returns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  avoir_number TEXT NOT NULL UNIQUE,
  client_id UUID REFERENCES public.clients(id) ON DELETE SET NULL,
  product_id UUID REFERENCES public.products(id) ON DELETE SET NULL,
  product_name TEXT NOT NULL,
  product_ref TEXT,
  quantity INTEGER NOT NULL DEFAULT 1,
  unit_price NUMERIC(10,2) NOT NULL DEFAULT 0,
  total_amount NUMERIC(10,2) NOT NULL DEFAULT 0,
  reason public.return_reason NOT NULL DEFAULT 'other',
  reason_notes TEXT,
  refund_type public.return_refund_type NOT NULL DEFAULT 'store_credit',
  return_status public.return_status NOT NULL DEFAULT 'pending',
  stock_updated BOOLEAN NOT NULL DEFAULT false,
  credit_applied BOOLEAN NOT NULL DEFAULT false,
  original_receipt TEXT,
  processed_by TEXT DEFAULT 'Admin',
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_returns_client_id ON public.returns(client_id);
CREATE INDEX IF NOT EXISTS idx_returns_product_id ON public.returns(product_id);
CREATE INDEX IF NOT EXISTS idx_returns_avoir_number ON public.returns(avoir_number);
CREATE INDEX IF NOT EXISTS idx_returns_created_at ON public.returns(created_at DESC);

-- Enable RLS
ALTER TABLE public.returns ENABLE ROW LEVEL SECURITY;

-- RLS Policies (open access for POS staff)
DROP POLICY IF EXISTS "returns_open_access" ON public.returns;
CREATE POLICY "returns_open_access" ON public.returns FOR ALL TO public USING (true) WITH CHECK (true);

-- Function to generate avoir number
CREATE OR REPLACE FUNCTION public.generate_avoir_number()
RETURNS TEXT
LANGUAGE plpgsql
AS $$
DECLARE
  seq_val BIGINT;
  year_part TEXT;
BEGIN
  seq_val := nextval('public.avoir_number_seq');
  year_part := to_char(CURRENT_DATE, 'YY');
  RETURN 'AV-' || year_part || '-' || LPAD(seq_val::TEXT, 4, '0');
END;
$$;

-- Updated_at trigger
CREATE OR REPLACE FUNCTION public.returns_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS returns_updated_at_trigger ON public.returns;
CREATE TRIGGER returns_updated_at_trigger
  BEFORE UPDATE ON public.returns
  FOR EACH ROW EXECUTE FUNCTION public.returns_updated_at();
