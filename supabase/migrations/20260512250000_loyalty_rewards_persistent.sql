-- Loyalty Rewards Persistent System
-- Adds: client_loyalty_rewards table for persistent available/used/expired rewards
-- Adds: used_at, ticket_ref, expiry_date, unlocked_at columns for full history

-- ── 1. CLIENT LOYALTY REWARDS TABLE ──────────────────────────────────────────
-- Stores rewards that have been unlocked for a client and tracks their usage
CREATE TABLE IF NOT EXISTS public.client_loyalty_rewards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  tier_id UUID REFERENCES public.loyalty_tiers(id) ON DELETE SET NULL,
  reward_type TEXT NOT NULL,
  reward_description TEXT NOT NULL,
  reward_value NUMERIC(10,2) DEFAULT 0,
  reward_product_id UUID REFERENCES public.loyalty_reward_products(id) ON DELETE SET NULL,
  -- Status lifecycle: available → used | expired | cancelled
  status TEXT NOT NULL DEFAULT 'available' CHECK (status IN ('available', 'used', 'expired', 'cancelled')),
  unlocked_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  points_at_unlock INTEGER NOT NULL DEFAULT 0,
  expiry_date TIMESTAMPTZ DEFAULT NULL,
  -- Usage tracking
  used_at TIMESTAMPTZ DEFAULT NULL,
  ticket_ref TEXT DEFAULT NULL,
  cashier_name TEXT DEFAULT NULL,
  notes TEXT DEFAULT NULL,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- ── 2. INDEXES ────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_client_loyalty_rewards_client ON public.client_loyalty_rewards(client_id);
CREATE INDEX IF NOT EXISTS idx_client_loyalty_rewards_status ON public.client_loyalty_rewards(status);
CREATE INDEX IF NOT EXISTS idx_client_loyalty_rewards_client_status ON public.client_loyalty_rewards(client_id, status);
CREATE INDEX IF NOT EXISTS idx_client_loyalty_rewards_expiry ON public.client_loyalty_rewards(expiry_date) WHERE expiry_date IS NOT NULL;

-- ── 3. UPDATED_AT TRIGGER ─────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.update_client_loyalty_rewards_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_client_loyalty_rewards_updated_at ON public.client_loyalty_rewards;
CREATE TRIGGER trg_client_loyalty_rewards_updated_at
  BEFORE UPDATE ON public.client_loyalty_rewards
  FOR EACH ROW EXECUTE FUNCTION public.update_client_loyalty_rewards_updated_at();

-- ── 4. AUTO-EXPIRE FUNCTION ───────────────────────────────────────────────────
-- Marks rewards as expired when their expiry_date has passed
CREATE OR REPLACE FUNCTION public.expire_loyalty_rewards()
RETURNS INTEGER LANGUAGE plpgsql AS $$
DECLARE
  expired_count INTEGER;
BEGIN
  UPDATE public.client_loyalty_rewards
  SET status = 'expired', updated_at = CURRENT_TIMESTAMP
  WHERE status = 'available'
    AND expiry_date IS NOT NULL
    AND expiry_date < CURRENT_TIMESTAMP;
  GET DIAGNOSTICS expired_count = ROW_COUNT;
  RETURN expired_count;
END;
$$;

-- ── 5. RLS ────────────────────────────────────────────────────────────────────
ALTER TABLE public.client_loyalty_rewards ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "open_access_client_loyalty_rewards" ON public.client_loyalty_rewards;
CREATE POLICY "open_access_client_loyalty_rewards"
  ON public.client_loyalty_rewards FOR ALL TO public USING (true) WITH CHECK (true);
