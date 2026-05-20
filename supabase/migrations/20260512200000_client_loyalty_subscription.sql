-- Client loyalty & subscription enhancements
-- Adds: client_type, loyalty_discount, subscription fields to clients table
-- Adds: client_subscriptions table
-- Adds: client_notes table

-- 1. Add new columns to clients table
ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS client_type TEXT NOT NULL DEFAULT 'particulier'
    CHECK (client_type IN ('particulier', 'professionnel', 'vip', 'abonne', 'non_abonne')),
  ADD COLUMN IF NOT EXISTS loyalty_discount_type TEXT DEFAULT NULL
    CHECK (loyalty_discount_type IN ('pro_5', 'pro_10', 'pro_15', 'custom', 'vip', 'classic', NULL)),
  ADD COLUMN IF NOT EXISTS loyalty_discount_value NUMERIC(5,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_purchase_at TIMESTAMPTZ DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS balance_due NUMERIC(10,2) DEFAULT 0;

-- 2. Create client_subscriptions table
CREATE TABLE IF NOT EXISTS public.client_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  subscription_type TEXT NOT NULL DEFAULT 'standard',
  discount_percent NUMERIC(5,2) NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'inactive', 'expired', 'suspended')),
  start_date DATE NOT NULL,
  end_date DATE,
  auto_renew BOOLEAN DEFAULT FALSE,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Create client_internal_notes table
CREATE TABLE IF NOT EXISTS public.client_internal_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  author TEXT DEFAULT 'Vendeur',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. RLS policies
ALTER TABLE public.client_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.client_internal_notes ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'client_subscriptions' AND policyname = 'allow_all_client_subscriptions'
  ) THEN
    CREATE POLICY allow_all_client_subscriptions ON public.client_subscriptions FOR ALL USING (true) WITH CHECK (true);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'client_internal_notes' AND policyname = 'allow_all_client_internal_notes'
  ) THEN
    CREATE POLICY allow_all_client_internal_notes ON public.client_internal_notes FOR ALL USING (true) WITH CHECK (true);
  END IF;
END $$;
