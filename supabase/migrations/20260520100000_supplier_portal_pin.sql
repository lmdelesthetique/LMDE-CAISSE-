-- ============================================================
-- SUPPLIER PORTAL PIN AUTH — BeautyPOS
-- Migrates supplier_portal_users from Supabase Auth to PIN-based auth
-- ============================================================

-- 1. Make auth_user_id nullable (no longer required for PIN auth)
ALTER TABLE public.supplier_portal_users
  ALTER COLUMN auth_user_id DROP NOT NULL;

-- 2. Add pin_code column
ALTER TABLE public.supplier_portal_users
  ADD COLUMN IF NOT EXISTS pin_code TEXT;

-- 3. Deduplicate supplier_id rows before adding unique constraint
--    (keep the most recent row per supplier_id)
DELETE FROM public.supplier_portal_users spu1
WHERE id NOT IN (
  SELECT DISTINCT ON (supplier_id) id
  FROM public.supplier_portal_users
  ORDER BY supplier_id, created_at DESC
);

-- 4. Add unique constraint on supplier_id (required for upsert onConflict)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'supplier_portal_users_supplier_id_key'
  ) THEN
    ALTER TABLE public.supplier_portal_users
      ADD CONSTRAINT supplier_portal_users_supplier_id_key UNIQUE (supplier_id);
  END IF;
END $$;

-- 5. Index on pin_code for fast lookups
CREATE INDEX IF NOT EXISTS idx_supplier_portal_users_pin_code
  ON public.supplier_portal_users(pin_code);

-- 6. SECURITY DEFINER function — bypasses RLS so anonymous users can verify their PIN
CREATE OR REPLACE FUNCTION public.verify_supplier_pin(p_pin TEXT)
RETURNS TABLE (supplier_id UUID, company_name TEXT)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT spu.supplier_id, s.company_name
  FROM public.supplier_portal_users spu
  JOIN public.suppliers s ON s.id = spu.supplier_id
  WHERE spu.pin_code = p_pin
    AND spu.is_active = true
  LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.verify_supplier_pin(TEXT) TO anon;
GRANT EXECUTE ON FUNCTION public.verify_supplier_pin(TEXT) TO authenticated;
