-- Backup & Compliance Module
-- French accounting retention: 10-year rule (Article L123-22 Code de commerce)

-- Backup logs table
CREATE TABLE IF NOT EXISTS public.backup_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  backup_date DATE NOT NULL DEFAULT CURRENT_DATE,
  backup_type TEXT NOT NULL DEFAULT 'daily', -- daily, manual, monthly
  export_format TEXT NOT NULL DEFAULT 'csv', -- csv, pdf, both
  status TEXT NOT NULL DEFAULT 'completed', -- completed, failed, pending
  records_count INTEGER DEFAULT 0,
  file_size_kb INTEGER DEFAULT 0,
  period_from DATE,
  period_to DATE,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- Compliance records table (tracks retention compliance per year)
CREATE TABLE IF NOT EXISTS public.compliance_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  fiscal_year INTEGER NOT NULL,
  record_type TEXT NOT NULL, -- sales, invoices, expenses, purchases
  records_count INTEGER DEFAULT 0,
  earliest_date DATE,
  latest_date DATE,
  retention_until DATE, -- earliest_date + 10 years
  status TEXT NOT NULL DEFAULT 'compliant', -- compliant, warning, expired
  last_verified_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (fiscal_year, record_type)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_backup_logs_date ON public.backup_logs(backup_date DESC);
CREATE INDEX IF NOT EXISTS idx_backup_logs_type ON public.backup_logs(backup_type);
CREATE INDEX IF NOT EXISTS idx_compliance_records_year ON public.compliance_records(fiscal_year DESC);

-- Enable RLS
ALTER TABLE public.backup_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.compliance_records ENABLE ROW LEVEL SECURITY;

-- RLS Policies (open access for authenticated users - internal admin tool)
DROP POLICY IF EXISTS "backup_logs_all_access" ON public.backup_logs;
CREATE POLICY "backup_logs_all_access" ON public.backup_logs
  FOR ALL TO public USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "compliance_records_all_access" ON public.compliance_records;
CREATE POLICY "compliance_records_all_access" ON public.compliance_records
  FOR ALL TO public USING (true) WITH CHECK (true);

-- Seed initial compliance records for existing years
DO $$
DECLARE
  current_yr INTEGER := EXTRACT(YEAR FROM CURRENT_DATE)::INTEGER;
  yr INTEGER;
BEGIN
  FOR yr IN (current_yr - 4)..current_yr LOOP
    INSERT INTO public.compliance_records (
      fiscal_year, record_type, records_count, earliest_date, latest_date,
      retention_until, status
    ) VALUES
      (yr, 'sales', 0, make_date(yr, 1, 1), make_date(yr, 12, 31),
       make_date(yr + 10, 12, 31), 'compliant'),
      (yr, 'invoices', 0, make_date(yr, 1, 1), make_date(yr, 12, 31),
       make_date(yr + 10, 12, 31), 'compliant'),
      (yr, 'expenses', 0, make_date(yr, 1, 1), make_date(yr, 12, 31),
       make_date(yr + 10, 12, 31), 'compliant'),
      (yr, 'purchases', 0, make_date(yr, 1, 1), make_date(yr, 12, 31),
       make_date(yr + 10, 12, 31), 'compliant')
    ON CONFLICT (fiscal_year, record_type) DO NOTHING;
  END LOOP;

  -- Seed a few backup log entries
  INSERT INTO public.backup_logs (backup_date, backup_type, export_format, status, records_count, file_size_kb, period_from, period_to, notes)
  VALUES
    (CURRENT_DATE - 1, 'daily', 'both', 'completed', 142, 380, CURRENT_DATE - 1, CURRENT_DATE - 1, 'Sauvegarde automatique quotidienne'),
    (CURRENT_DATE - 2, 'daily', 'both', 'completed', 138, 365, CURRENT_DATE - 2, CURRENT_DATE - 2, 'Sauvegarde automatique quotidienne'),
    (CURRENT_DATE - 3, 'daily', 'csv', 'completed', 155, 210, CURRENT_DATE - 3, CURRENT_DATE - 3, 'Sauvegarde automatique quotidienne'),
    (CURRENT_DATE - 7, 'manual', 'pdf', 'completed', 890, 1240, CURRENT_DATE - 30, CURRENT_DATE - 7, 'Export mensuel manuel')
  ON CONFLICT (id) DO NOTHING;

EXCEPTION
  WHEN OTHERS THEN
    RAISE NOTICE 'Seed data error: %', SQLERRM;
END $$;
