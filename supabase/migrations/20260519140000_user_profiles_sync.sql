-- ============================================================
-- USER PROFILES SYNC — BeautyPOS Production
-- Timestamp: 20260519140000
-- Creates user_profiles table, trigger for auto-creation,
-- and ensures all RLS policies allow authenticated access.
-- ============================================================

-- ── 1. user_profiles table ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.user_profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  full_name TEXT NOT NULL DEFAULT '',
  avatar_url TEXT,
  role TEXT NOT NULL DEFAULT 'admin',
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_user_profiles_email ON public.user_profiles(email);

-- ── 2. RLS ────────────────────────────────────────────────────────────────────
ALTER TABLE public.user_profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "users_manage_own_user_profiles" ON public.user_profiles;
CREATE POLICY "users_manage_own_user_profiles"
  ON public.user_profiles
  FOR ALL
  TO authenticated
  USING (id = auth.uid())
  WITH CHECK (id = auth.uid());

-- Allow service role full access (needed for trigger + edge functions)
DROP POLICY IF EXISTS "service_role_full_access_user_profiles" ON public.user_profiles;
CREATE POLICY "service_role_full_access_user_profiles"
  ON public.user_profiles
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- ── 3. Auto-create profile on new auth user ───────────────────────────────────
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  INSERT INTO public.user_profiles (id, email, full_name, avatar_url, role)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1)),
    COALESCE(NEW.raw_user_meta_data->>'avatar_url', ''),
    COALESCE(NEW.raw_user_meta_data->>'role', 'admin')
  )
  ON CONFLICT (id) DO UPDATE SET
    email = EXCLUDED.email,
    full_name = COALESCE(EXCLUDED.full_name, public.user_profiles.full_name),
    updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

-- ── 4. Backfill existing auth users into user_profiles ────────────────────────
-- This ensures all existing production users get a profile row
DO $$
DECLARE
  auth_user RECORD;
BEGIN
  FOR auth_user IN
    SELECT id, email, raw_user_meta_data
    FROM auth.users
    WHERE id NOT IN (SELECT id FROM public.user_profiles)
  LOOP
    INSERT INTO public.user_profiles (id, email, full_name, avatar_url, role)
    VALUES (
      auth_user.id,
      auth_user.email,
      COALESCE(auth_user.raw_user_meta_data->>'full_name', split_part(auth_user.email, '@', 1)),
      COALESCE(auth_user.raw_user_meta_data->>'avatar_url', ''),
      COALESCE(auth_user.raw_user_meta_data->>'role', 'admin')
    )
    ON CONFLICT (id) DO NOTHING;
  END LOOP;
  RAISE NOTICE 'Backfill user_profiles completed.';
EXCEPTION
  WHEN OTHERS THEN
    RAISE NOTICE 'Backfill error: %', SQLERRM;
END $$;

-- ── 5. updated_at auto-update trigger ────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_user_profiles_updated_at ON public.user_profiles;
CREATE TRIGGER trg_user_profiles_updated_at
  BEFORE UPDATE ON public.user_profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

-- ── 6. Ensure all core tables have open RLS for authenticated users ───────────
-- These tables use single-tenant model (one business = one Supabase project)
-- All authenticated users are staff/admins of the same business.

-- suppliers
ALTER TABLE public.suppliers ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "authenticated_full_access_suppliers" ON public.suppliers;
CREATE POLICY "authenticated_full_access_suppliers"
  ON public.suppliers FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- clients
ALTER TABLE public.clients ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "authenticated_full_access_clients" ON public.clients;
CREATE POLICY "authenticated_full_access_clients"
  ON public.clients FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- products
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='products') THEN
    EXECUTE 'ALTER TABLE public.products ENABLE ROW LEVEL SECURITY';
    EXECUTE 'DROP POLICY IF EXISTS "authenticated_full_access_products" ON public.products';
    EXECUTE 'CREATE POLICY "authenticated_full_access_products" ON public.products FOR ALL TO authenticated USING (true) WITH CHECK (true)';
  END IF;
END $$;

-- categories
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='categories') THEN
    EXECUTE 'ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY';
    EXECUTE 'DROP POLICY IF EXISTS "authenticated_full_access_categories" ON public.categories';
    EXECUTE 'CREATE POLICY "authenticated_full_access_categories" ON public.categories FOR ALL TO authenticated USING (true) WITH CHECK (true)';
  END IF;
END $$;

-- employees
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='employees') THEN
    EXECUTE 'ALTER TABLE public.employees ENABLE ROW LEVEL SECURITY';
    EXECUTE 'DROP POLICY IF EXISTS "authenticated_full_access_employees" ON public.employees';
    EXECUTE 'CREATE POLICY "authenticated_full_access_employees" ON public.employees FOR ALL TO authenticated USING (true) WITH CHECK (true)';
  END IF;
END $$;

-- reservations
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='reservations') THEN
    EXECUTE 'ALTER TABLE public.reservations ENABLE ROW LEVEL SECURITY';
    EXECUTE 'DROP POLICY IF EXISTS "authenticated_full_access_reservations" ON public.reservations';
    EXECUTE 'CREATE POLICY "authenticated_full_access_reservations" ON public.reservations FOR ALL TO authenticated USING (true) WITH CHECK (true)';
  END IF;
END $$;

-- inventory_products
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='inventory_products') THEN
    EXECUTE 'ALTER TABLE public.inventory_products ENABLE ROW LEVEL SECURITY';
    EXECUTE 'DROP POLICY IF EXISTS "authenticated_full_access_inventory_products" ON public.inventory_products';
    EXECUTE 'CREATE POLICY "authenticated_full_access_inventory_products" ON public.inventory_products FOR ALL TO authenticated USING (true) WITH CHECK (true)';
  END IF;
END $$;

-- app_audit_log (already exists, ensure policies are correct)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='app_audit_log') THEN
    EXECUTE 'DROP POLICY IF EXISTS "authenticated_full_access_audit_log" ON public.app_audit_log';
    EXECUTE 'CREATE POLICY "authenticated_full_access_audit_log" ON public.app_audit_log FOR ALL TO authenticated USING (true) WITH CHECK (true)';
  END IF;
END $$;
