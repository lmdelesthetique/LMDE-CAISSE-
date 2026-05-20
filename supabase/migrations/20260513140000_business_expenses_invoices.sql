-- ============================================================
-- Business Expenses + Invoices/Quotes Module
-- ============================================================

-- ── 1. ENUMS ──────────────────────────────────────────────────────────────────

DROP TYPE IF EXISTS public.expense_category CASCADE;
CREATE TYPE public.expense_category AS ENUM (
  'daily', 'fixed_monthly', 'variable'
);

DROP TYPE IF EXISTS public.expense_type CASCADE;
CREATE TYPE public.expense_type AS ENUM (
  'fuel', 'supplies', 'delivery', 'urgent_purchase', 'shop_fees',
  'rent', 'salary', 'insurance', 'internet', 'software', 'accounting',
  'electricity', 'advertising', 'exceptional_transport', 'repair',
  'one_time_purchase', 'bank_fees', 'other'
);

DROP TYPE IF EXISTS public.expense_payment_method CASCADE;
CREATE TYPE public.expense_payment_method AS ENUM (
  'cash', 'card', 'transfer', 'check', 'other'
);

DROP TYPE IF EXISTS public.invoice_doc_type CASCADE;
CREATE TYPE public.invoice_doc_type AS ENUM (
  'ticket', 'invoice', 'quote', 'credit_note', 'proforma'
);

DROP TYPE IF EXISTS public.invoice_status CASCADE;
CREATE TYPE public.invoice_status AS ENUM (
  'draft', 'sent', 'accepted', 'rejected', 'paid', 'overdue', 'cancelled', 'converted'
);

-- ── 2. BUSINESS EXPENSES TABLE ────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.business_expenses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category public.expense_category NOT NULL DEFAULT 'daily',
  expense_type public.expense_type NOT NULL DEFAULT 'other',
  label TEXT NOT NULL,
  amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  expense_date DATE NOT NULL DEFAULT CURRENT_DATE,
  payment_method public.expense_payment_method NOT NULL DEFAULT 'cash',
  receipt_url TEXT,
  note TEXT,
  is_recurring BOOLEAN NOT NULL DEFAULT false,
  recurrence_day INTEGER,
  supplier_id UUID REFERENCES public.suppliers(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_business_expenses_date ON public.business_expenses(expense_date);
CREATE INDEX IF NOT EXISTS idx_business_expenses_category ON public.business_expenses(category);

ALTER TABLE public.business_expenses ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "open_access_business_expenses" ON public.business_expenses;
CREATE POLICY "open_access_business_expenses" ON public.business_expenses
  FOR ALL TO public USING (true) WITH CHECK (true);

-- ── 3. INVOICES / QUOTES TABLE ────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.invoices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  doc_type public.invoice_doc_type NOT NULL DEFAULT 'invoice',
  doc_status public.invoice_status NOT NULL DEFAULT 'draft',
  doc_number TEXT NOT NULL,
  issue_date DATE NOT NULL DEFAULT CURRENT_DATE,
  sale_date DATE,
  due_date DATE,
  -- Seller info
  seller_name TEXT,
  seller_address TEXT,
  seller_siret TEXT,
  seller_tva_number TEXT,
  -- Buyer info
  client_id UUID REFERENCES public.clients(id) ON DELETE SET NULL,
  client_name TEXT,
  client_address TEXT,
  client_siret TEXT,
  client_tva_number TEXT,
  -- Totals
  total_ht NUMERIC(12,2) NOT NULL DEFAULT 0,
  total_tva NUMERIC(12,2) NOT NULL DEFAULT 0,
  total_ttc NUMERIC(12,2) NOT NULL DEFAULT 0,
  -- Payment
  payment_terms TEXT,
  payment_due_date DATE,
  late_penalty_rate NUMERIC(6,2) DEFAULT 3,
  recovery_fee NUMERIC(8,2) DEFAULT 40,
  -- Meta
  notes TEXT,
  legal_mentions TEXT,
  converted_from_id UUID REFERENCES public.invoices(id) ON DELETE SET NULL,
  pos_sale_ref TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_invoices_doc_type ON public.invoices(doc_type);
CREATE INDEX IF NOT EXISTS idx_invoices_status ON public.invoices(doc_status);
CREATE INDEX IF NOT EXISTS idx_invoices_client ON public.invoices(client_id);
CREATE INDEX IF NOT EXISTS idx_invoices_date ON public.invoices(issue_date);

ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "open_access_invoices" ON public.invoices;
CREATE POLICY "open_access_invoices" ON public.invoices
  FOR ALL TO public USING (true) WITH CHECK (true);

-- ── 4. INVOICE LINES TABLE ────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.invoice_lines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id UUID NOT NULL REFERENCES public.invoices(id) ON DELETE CASCADE,
  product_id UUID REFERENCES public.products(id) ON DELETE SET NULL,
  description TEXT NOT NULL,
  quantity NUMERIC(10,3) NOT NULL DEFAULT 1,
  unit_price_ht NUMERIC(12,4) NOT NULL DEFAULT 0,
  tva_rate NUMERIC(5,2) NOT NULL DEFAULT 8.5,
  discount_percent NUMERIC(5,2) NOT NULL DEFAULT 0,
  total_ht NUMERIC(12,2) NOT NULL DEFAULT 0,
  total_tva NUMERIC(12,2) NOT NULL DEFAULT 0,
  total_ttc NUMERIC(12,2) NOT NULL DEFAULT 0,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_invoice_lines_invoice ON public.invoice_lines(invoice_id);

ALTER TABLE public.invoice_lines ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "open_access_invoice_lines" ON public.invoice_lines;
CREATE POLICY "open_access_invoice_lines" ON public.invoice_lines
  FOR ALL TO public USING (true) WITH CHECK (true);

-- ── 5. STRUCTURE FEE CONFIG TABLE ─────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.structure_fee_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  month_year TEXT NOT NULL,
  fixed_expenses NUMERIC(12,2) NOT NULL DEFAULT 0,
  variable_expenses NUMERIC(12,2) NOT NULL DEFAULT 0,
  reference_revenue NUMERIC(12,2) NOT NULL DEFAULT 0,
  recommended_pct NUMERIC(6,2) NOT NULL DEFAULT 0,
  applied_pct NUMERIC(6,2) NOT NULL DEFAULT 0,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_structure_fee_month ON public.structure_fee_config(month_year);

ALTER TABLE public.structure_fee_config ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "open_access_structure_fee_config" ON public.structure_fee_config;
CREATE POLICY "open_access_structure_fee_config" ON public.structure_fee_config
  FOR ALL TO public USING (true) WITH CHECK (true);
