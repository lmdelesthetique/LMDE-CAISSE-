-- Migration: App Authentication & Audit Log
-- Timestamp: 20260515140000
-- Creates app_audit_log table for tracking user actions and logins

-- ── Audit Log Table ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.app_audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  user_email TEXT,
  action_type TEXT NOT NULL,
  description TEXT NOT NULL,
  ip_address TEXT,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_app_audit_log_user_id ON public.app_audit_log(user_id);
CREATE INDEX IF NOT EXISTS idx_app_audit_log_action_type ON public.app_audit_log(action_type);
CREATE INDEX IF NOT EXISTS idx_app_audit_log_created_at ON public.app_audit_log(created_at DESC);

ALTER TABLE public.app_audit_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "authenticated_can_insert_audit_log" ON public.app_audit_log;
CREATE POLICY "authenticated_can_insert_audit_log"
  ON public.app_audit_log
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

DROP POLICY IF EXISTS "authenticated_can_read_audit_log" ON public.app_audit_log;
CREATE POLICY "authenticated_can_read_audit_log"
  ON public.app_audit_log
  FOR SELECT
  TO authenticated
  USING (true);
