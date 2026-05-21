-- ============================================================
-- SUPPLIER PORTAL — admin PIN upsert bypasses RLS
-- The direct INSERT/UPDATE on supplier_portal_users is blocked by RLS
-- for authenticated admin users (auth.uid() != auth_user_id).
-- This SECURITY DEFINER function runs as the owner and bypasses RLS.
-- Granted to `authenticated` only (never anon).
-- ============================================================

CREATE OR REPLACE FUNCTION public.upsert_supplier_portal_pin(
  p_supplier_id UUID,
  p_pin         TEXT
)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  INSERT INTO public.supplier_portal_users (supplier_id, pin_code, is_active)
  VALUES (p_supplier_id, p_pin, true)
  ON CONFLICT (supplier_id)
  DO UPDATE SET
    pin_code   = EXCLUDED.pin_code,
    is_active  = true,
    updated_at = now();

  UPDATE public.suppliers
  SET portal_login          = p_pin,
      portal_password_plain = null
  WHERE id = p_supplier_id;
$$;

GRANT EXECUTE ON FUNCTION public.upsert_supplier_portal_pin(UUID, TEXT) TO authenticated;
