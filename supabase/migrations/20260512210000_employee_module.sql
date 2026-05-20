-- ============================================================
-- EMPLOYEE MODULE MIGRATION
-- Timestamp: 20260512210000
-- ============================================================

-- 1. ENUM TYPES
DROP TYPE IF EXISTS public.employee_role CASCADE;
CREATE TYPE public.employee_role AS ENUM (
  'admin',
  'manager',
  'cashier',
  'stock_manager',
  'sales_rep'
);

DROP TYPE IF EXISTS public.employee_status CASCADE;
CREATE TYPE public.employee_status AS ENUM (
  'active',
  'inactive',
  'on_leave',
  'terminated'
);

-- 2. EMPLOYEES TABLE
CREATE TABLE IF NOT EXISTS public.employees (
  id                        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  first_name                TEXT NOT NULL,
  last_name                 TEXT NOT NULL,
  email                     TEXT,
  phone                     TEXT,
  role                      public.employee_role NOT NULL DEFAULT 'cashier'::public.employee_role,
  status                    public.employee_status NOT NULL DEFAULT 'active'::public.employee_status,
  pos_pin                   TEXT,
  avatar_initials           TEXT,
  hire_date                 DATE,
  notes                     TEXT,
  -- Permissions
  perm_cashier_access       BOOLEAN NOT NULL DEFAULT true,
  perm_stock_access         BOOLEAN NOT NULL DEFAULT false,
  perm_suppliers_access     BOOLEAN NOT NULL DEFAULT false,
  perm_products_access      BOOLEAN NOT NULL DEFAULT false,
  perm_stats_access         BOOLEAN NOT NULL DEFAULT false,
  perm_discount_auth        BOOLEAN NOT NULL DEFAULT false,
  perm_cancel_auth          BOOLEAN NOT NULL DEFAULT false,
  perm_price_modify         BOOLEAN NOT NULL DEFAULT false,
  perm_admin_access         BOOLEAN NOT NULL DEFAULT false,
  -- Monthly objective
  monthly_objective         NUMERIC(12,2) NOT NULL DEFAULT 0,
  created_at                TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at                TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 3. EMPLOYEE SALES TABLE (tracks each sale per employee)
CREATE TABLE IF NOT EXISTS public.employee_sales (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id       UUID NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  receipt_number    TEXT NOT NULL,
  total_ttc         NUMERIC(12,2) NOT NULL DEFAULT 0,
  discount_amount   NUMERIC(12,2) NOT NULL DEFAULT 0,
  items_count       INTEGER NOT NULL DEFAULT 0,
  payment_method    TEXT,
  was_cancelled     BOOLEAN NOT NULL DEFAULT false,
  client_id         UUID REFERENCES public.clients(id) ON DELETE SET NULL,
  sold_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 4. EMPLOYEE MONTHLY OBJECTIVES TABLE
CREATE TABLE IF NOT EXISTS public.employee_objectives (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id     UUID NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  year            INTEGER NOT NULL,
  month           INTEGER NOT NULL CHECK (month BETWEEN 1 AND 12),
  target_revenue  NUMERIC(12,2) NOT NULL DEFAULT 0,
  target_tickets  INTEGER NOT NULL DEFAULT 0,
  notes           TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 5. INDEXES
CREATE INDEX IF NOT EXISTS idx_employees_role ON public.employees(role);
CREATE INDEX IF NOT EXISTS idx_employees_status ON public.employees(status);
CREATE INDEX IF NOT EXISTS idx_employee_sales_employee_id ON public.employee_sales(employee_id);
CREATE INDEX IF NOT EXISTS idx_employee_sales_sold_at ON public.employee_sales(sold_at);
CREATE INDEX IF NOT EXISTS idx_employee_objectives_employee_id ON public.employee_objectives(employee_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_employee_objectives_unique ON public.employee_objectives(employee_id, year, month);

-- 6. UPDATED_AT TRIGGER FUNCTION
CREATE OR REPLACE FUNCTION public.set_employee_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- 7. ENABLE RLS
ALTER TABLE public.employees ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.employee_sales ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.employee_objectives ENABLE ROW LEVEL SECURITY;

-- 8. RLS POLICIES
DROP POLICY IF EXISTS "open_access_employees" ON public.employees;
CREATE POLICY "open_access_employees"
ON public.employees FOR ALL TO public USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "open_access_employee_sales" ON public.employee_sales;
CREATE POLICY "open_access_employee_sales"
ON public.employee_sales FOR ALL TO public USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "open_access_employee_objectives" ON public.employee_objectives;
CREATE POLICY "open_access_employee_objectives"
ON public.employee_objectives FOR ALL TO public USING (true) WITH CHECK (true);

-- 9. TRIGGERS
DROP TRIGGER IF EXISTS trg_employees_updated_at ON public.employees;
CREATE TRIGGER trg_employees_updated_at
  BEFORE UPDATE ON public.employees
  FOR EACH ROW EXECUTE FUNCTION public.set_employee_updated_at();

DROP TRIGGER IF EXISTS trg_employee_objectives_updated_at ON public.employee_objectives;
CREATE TRIGGER trg_employee_objectives_updated_at
  BEFORE UPDATE ON public.employee_objectives
  FOR EACH ROW EXECUTE FUNCTION public.set_employee_updated_at();

-- 10. MOCK DATA
DO $$
DECLARE
  emp1_id UUID := gen_random_uuid();
  emp2_id UUID := gen_random_uuid();
  emp3_id UUID := gen_random_uuid();
  emp4_id UUID := gen_random_uuid();
  existing_client_id UUID;
BEGIN
  SELECT id INTO existing_client_id FROM public.clients LIMIT 1;

  -- Employees
  INSERT INTO public.employees (
    id, first_name, last_name, email, phone, role, status, pos_pin, avatar_initials,
    hire_date, monthly_objective,
    perm_cashier_access, perm_stock_access, perm_suppliers_access, perm_products_access,
    perm_stats_access, perm_discount_auth, perm_cancel_auth, perm_price_modify, perm_admin_access
  ) VALUES
    (emp1_id, 'Sophie', 'Fontaine', 'sophie@beautypos.fr', '0612345678',
     'admin'::public.employee_role, 'active'::public.employee_status, '1234', 'SF',
     '2022-01-15', 8000,
     true, true, true, true, true, true, true, true, true),
    (emp2_id, 'Léa', 'Martin', 'lea@beautypos.fr', '0623456789',
     'cashier'::public.employee_role, 'active'::public.employee_status, '5678', 'LM',
     '2023-03-01', 5000,
     true, false, false, false, false, true, false, false, false),
    (emp3_id, 'Karim', 'Benali', 'karim@beautypos.fr', '0634567890',
     'stock_manager'::public.employee_role, 'active'::public.employee_status, '9012', 'KB',
     '2023-06-15', 4000,
     true, true, true, true, false, false, false, false, false),
    (emp4_id, 'Amina', 'Diallo', 'amina@beautypos.fr', '0645678901',
     'sales_rep'::public.employee_role, 'on_leave'::public.employee_status, '3456', 'AD',
     '2024-01-10', 6000,
     true, false, false, false, true, true, false, true, false)
  ON CONFLICT (id) DO NOTHING;

  -- Sales for emp1
  INSERT INTO public.employee_sales (employee_id, receipt_number, total_ttc, discount_amount, items_count, payment_method, was_cancelled, client_id, sold_at)
  VALUES
    (emp1_id, 'T-2026-001', 125.50, 0, 3, 'card', false, existing_client_id, now() - interval '1 day'),
    (emp1_id, 'T-2026-002', 89.00, 10.00, 2, 'cash', false, existing_client_id, now() - interval '2 days'),
    (emp1_id, 'T-2026-003', 210.00, 0, 5, 'card', false, null, now() - interval '3 days'),
    (emp1_id, 'T-2026-004', 45.00, 5.00, 1, 'cash', true, null, now() - interval '4 days'),
    (emp2_id, 'T-2026-005', 67.50, 0, 2, 'card', false, existing_client_id, now() - interval '1 day'),
    (emp2_id, 'T-2026-006', 150.00, 15.00, 4, 'card', false, null, now() - interval '2 days'),
    (emp3_id, 'T-2026-007', 320.00, 0, 8, 'cash', false, null, now() - interval '1 day')
  ON CONFLICT (id) DO NOTHING;

  -- Monthly objectives
  INSERT INTO public.employee_objectives (employee_id, year, month, target_revenue, target_tickets)
  VALUES
    (emp1_id, 2026, 5, 8000, 120),
    (emp1_id, 2026, 4, 7500, 110),
    (emp2_id, 2026, 5, 5000, 80),
    (emp2_id, 2026, 4, 4500, 75),
    (emp3_id, 2026, 5, 4000, 60),
    (emp4_id, 2026, 5, 6000, 90)
  ON CONFLICT (employee_id, year, month) DO NOTHING;

EXCEPTION
  WHEN OTHERS THEN
    RAISE NOTICE 'Mock data insertion failed: %', SQLERRM;
END $$;
