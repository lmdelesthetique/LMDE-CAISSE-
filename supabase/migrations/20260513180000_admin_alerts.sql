-- Admin alerts table for failed exports, missed backups, compliance violations
CREATE TABLE IF NOT EXISTS public.admin_alerts (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  alert_type text NOT NULL CHECK (alert_type IN ('failed_export', 'missed_backup', 'compliance_violation')),
  severity text NOT NULL DEFAULT 'warning' CHECK (severity IN ('info', 'warning', 'critical')),
  title text NOT NULL,
  message text NOT NULL,
  details jsonb DEFAULT '{}',
  is_read boolean NOT NULL DEFAULT false,
  is_resolved boolean NOT NULL DEFAULT false,
  resolved_at timestamptz,
  resolved_by text,
  created_at timestamptz DEFAULT now() NOT NULL
);

-- Index for fast unread queries
CREATE INDEX IF NOT EXISTS admin_alerts_unread_idx ON public.admin_alerts (is_read, is_resolved, created_at DESC);
CREATE INDEX IF NOT EXISTS admin_alerts_type_idx ON public.admin_alerts (alert_type, created_at DESC);

-- Enable RLS
ALTER TABLE public.admin_alerts ENABLE ROW LEVEL SECURITY;

-- Allow all operations for authenticated users (admin app)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'admin_alerts' AND policyname = 'admin_alerts_all'
  ) THEN
    CREATE POLICY "admin_alerts_all" ON public.admin_alerts FOR ALL USING (true) WITH CHECK (true);
  END IF;
END $$;

-- Seed initial compliance violation alerts for years approaching expiry
INSERT INTO public.admin_alerts (alert_type, severity, title, message, details, is_read, is_resolved)
SELECT
  'compliance_violation',
  CASE WHEN (EXTRACT(YEAR FROM NOW()) - fiscal_year) >= 9 THEN 'critical' ELSE 'warning' END,
  'Échéance de conservation approchante — ' || fiscal_year::text,
  'Les données comptables de l''exercice ' || fiscal_year::text || ' arrivent à échéance de conservation légale (10 ans).',
  jsonb_build_object('fiscal_year', fiscal_year, 'retention_until', retention_until, 'record_type', record_type),
  false,
  false
FROM public.compliance_records
WHERE status IN ('warning', 'expired')
  AND NOT EXISTS (
    SELECT 1 FROM public.admin_alerts a
    WHERE a.alert_type = 'compliance_violation'
      AND (a.details->>'fiscal_year')::int = compliance_records.fiscal_year
  )
ON CONFLICT DO NOTHING;
