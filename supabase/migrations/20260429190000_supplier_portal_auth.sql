-- ============================================================
-- SUPPLIER PORTAL AUTH — BeautyPOS
-- Links Supabase auth users to supplier records
-- ============================================================

-- 1. supplier_portal_users: maps auth.users → suppliers
CREATE TABLE IF NOT EXISTS public.supplier_portal_users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  auth_user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  supplier_id UUID NOT NULL REFERENCES public.suppliers(id) ON DELETE CASCADE,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_supplier_portal_users_auth_user_id ON public.supplier_portal_users(auth_user_id);
CREATE INDEX IF NOT EXISTS idx_supplier_portal_users_supplier_id ON public.supplier_portal_users(supplier_id);

-- 2. Updated_at trigger
DROP TRIGGER IF EXISTS trg_supplier_portal_users_updated_at ON public.supplier_portal_users;
CREATE TRIGGER trg_supplier_portal_users_updated_at
  BEFORE UPDATE ON public.supplier_portal_users
  FOR EACH ROW EXECUTE FUNCTION public.update_supplier_updated_at();

-- 3. Enable RLS
ALTER TABLE public.supplier_portal_users ENABLE ROW LEVEL SECURITY;

-- 4. RLS: supplier portal users can only see their own mapping
DROP POLICY IF EXISTS "supplier_portal_users_own" ON public.supplier_portal_users;
CREATE POLICY "supplier_portal_users_own" ON public.supplier_portal_users
  FOR SELECT TO authenticated
  USING (auth_user_id = auth.uid());

-- Store staff (any authenticated user) can manage portal users
DROP POLICY IF EXISTS "store_manage_portal_users" ON public.supplier_portal_users;
CREATE POLICY "store_manage_portal_users" ON public.supplier_portal_users
  FOR ALL TO authenticated
  USING (true) WITH CHECK (true);

-- 5. Helper function: get supplier_id for the current auth user
CREATE OR REPLACE FUNCTION public.get_my_supplier_id()
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT supplier_id FROM public.supplier_portal_users
  WHERE auth_user_id = auth.uid() AND is_active = true
  LIMIT 1;
$$;

-- 6. Update supplier_orders RLS to also allow supplier portal users to view/update their own orders
DROP POLICY IF EXISTS "supplier_portal_view_own_orders" ON public.supplier_orders;
CREATE POLICY "supplier_portal_view_own_orders" ON public.supplier_orders
  FOR SELECT TO authenticated
  USING (
    supplier_id = public.get_my_supplier_id()
    OR created_by = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.supplier_portal_users spu
      WHERE spu.auth_user_id = auth.uid() AND spu.supplier_id = supplier_orders.supplier_id
    )
  );

DROP POLICY IF EXISTS "supplier_portal_update_own_orders" ON public.supplier_orders;
CREATE POLICY "supplier_portal_update_own_orders" ON public.supplier_orders
  FOR UPDATE TO authenticated
  USING (
    supplier_id = public.get_my_supplier_id()
  )
  WITH CHECK (
    supplier_id = public.get_my_supplier_id()
  );

-- 7. Allow supplier portal users to view their own claims
DROP POLICY IF EXISTS "supplier_portal_view_own_claims" ON public.supplier_claims;
CREATE POLICY "supplier_portal_view_own_claims" ON public.supplier_claims
  FOR SELECT TO authenticated
  USING (
    supplier_id = public.get_my_supplier_id()
    OR created_by = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.supplier_portal_users spu
      WHERE spu.auth_user_id = auth.uid() AND spu.supplier_id = supplier_claims.supplier_id
    )
  );

DROP POLICY IF EXISTS "supplier_portal_update_own_claims" ON public.supplier_claims;
CREATE POLICY "supplier_portal_update_own_claims" ON public.supplier_claims
  FOR UPDATE TO authenticated
  USING (supplier_id = public.get_my_supplier_id())
  WITH CHECK (supplier_id = public.get_my_supplier_id());

-- 8. Allow supplier portal users to view/insert messages for their supplier
DROP POLICY IF EXISTS "supplier_portal_view_own_messages" ON public.supplier_messages;
CREATE POLICY "supplier_portal_view_own_messages" ON public.supplier_messages
  FOR SELECT TO authenticated
  USING (
    supplier_id = public.get_my_supplier_id()
    OR EXISTS (
      SELECT 1 FROM public.supplier_portal_users spu
      WHERE spu.auth_user_id = auth.uid() AND spu.supplier_id = supplier_messages.supplier_id
    )
  );

DROP POLICY IF EXISTS "supplier_portal_insert_messages" ON public.supplier_messages;
CREATE POLICY "supplier_portal_insert_messages" ON public.supplier_messages
  FOR INSERT TO authenticated
  WITH CHECK (supplier_id = public.get_my_supplier_id());

-- 9. Allow supplier portal users to view/insert documents for their supplier
DROP POLICY IF EXISTS "supplier_portal_view_own_documents" ON public.supplier_documents;
CREATE POLICY "supplier_portal_view_own_documents" ON public.supplier_documents
  FOR SELECT TO authenticated
  USING (
    supplier_id = public.get_my_supplier_id()
    OR EXISTS (
      SELECT 1 FROM public.supplier_portal_users spu
      WHERE spu.auth_user_id = auth.uid() AND spu.supplier_id = supplier_documents.supplier_id
    )
  );

DROP POLICY IF EXISTS "supplier_portal_insert_documents" ON public.supplier_documents;
CREATE POLICY "supplier_portal_insert_documents" ON public.supplier_documents
  FOR INSERT TO authenticated
  WITH CHECK (supplier_id = public.get_my_supplier_id());

-- 10. Allow supplier portal users to view their own supplier profile
DROP POLICY IF EXISTS "supplier_portal_view_own_supplier" ON public.suppliers;
CREATE POLICY "supplier_portal_view_own_supplier" ON public.suppliers
  FOR SELECT TO authenticated
  USING (
    id = public.get_my_supplier_id()
    OR true
  );

-- 11. Mock supplier portal user (demo credentials)
DO $$
DECLARE
  portal_user_uuid UUID := gen_random_uuid();
  first_supplier_id UUID;
BEGIN
  -- Get first supplier if exists
  SELECT id INTO first_supplier_id FROM public.suppliers LIMIT 1;

  -- Create a demo supplier portal auth user
  INSERT INTO auth.users (
    id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
    created_at, updated_at, raw_user_meta_data, raw_app_meta_data,
    is_sso_user, is_anonymous, confirmation_token, confirmation_sent_at,
    recovery_token, recovery_sent_at, email_change_token_new, email_change,
    email_change_sent_at, email_change_token_current, email_change_confirm_status,
    reauthentication_token, reauthentication_sent_at, phone, phone_change,
    phone_change_token, phone_change_sent_at
  ) VALUES (
    portal_user_uuid, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
    'supplier@beautypos.demo', crypt('supplier123', gen_salt('bf', 10)), now(), now(), now(),
    jsonb_build_object('full_name', 'Demo Supplier', 'role', 'supplier'),
    jsonb_build_object('provider', 'email', 'providers', ARRAY['email']::TEXT[]),
    false, false, '', null, '', null, '', '', null, '', 0, '', null, null, '', '', null
  ) ON CONFLICT (id) DO NOTHING;

  -- Link portal user to first supplier if one exists
  IF first_supplier_id IS NOT NULL THEN
    INSERT INTO public.supplier_portal_users (auth_user_id, supplier_id, is_active)
    VALUES (portal_user_uuid, first_supplier_id, true)
    ON CONFLICT (auth_user_id) DO NOTHING;
  END IF;

EXCEPTION
  WHEN OTHERS THEN
    RAISE NOTICE 'Mock supplier portal user creation skipped: %', SQLERRM;
END $$;
