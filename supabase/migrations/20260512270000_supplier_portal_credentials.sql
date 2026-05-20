-- ============================================================
-- SUPPLIER PORTAL CREDENTIALS — BeautyPOS
-- Adds portal_login and portal_password_plain columns to suppliers
-- ============================================================

ALTER TABLE public.suppliers
  ADD COLUMN IF NOT EXISTS portal_login TEXT,
  ADD COLUMN IF NOT EXISTS portal_password_plain TEXT,
  ADD COLUMN IF NOT EXISTS portal_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_suppliers_portal_login ON public.suppliers(portal_login);
CREATE INDEX IF NOT EXISTS idx_suppliers_portal_user_id ON public.suppliers(portal_user_id);
