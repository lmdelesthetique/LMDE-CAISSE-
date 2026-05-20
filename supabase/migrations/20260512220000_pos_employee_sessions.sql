-- POS Employee Sessions & Action Log
-- Tracks shift sessions and all POS actions per employee

-- ─── POS Sessions ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.pos_sessions (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id     uuid NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  started_at      timestamptz NOT NULL DEFAULT now(),
  ended_at        timestamptz,
  is_active       boolean NOT NULL DEFAULT true,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pos_sessions_employee ON public.pos_sessions(employee_id);
CREATE INDEX IF NOT EXISTS idx_pos_sessions_active ON public.pos_sessions(is_active) WHERE is_active = true;

-- ─── POS Action Log ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.pos_action_log (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id      uuid REFERENCES public.pos_sessions(id) ON DELETE SET NULL,
  employee_id     uuid NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  action_type     text NOT NULL, -- 'sale', 'discount', 'cancel', 'price_change', 'hold', 'free_price'
  description     text,
  amount          numeric(10,2),
  meta            jsonb,
  performed_at    timestamptz NOT NULL DEFAULT now(),
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pos_action_log_employee ON public.pos_action_log(employee_id);
CREATE INDEX IF NOT EXISTS idx_pos_action_log_session ON public.pos_action_log(session_id);
CREATE INDEX IF NOT EXISTS idx_pos_action_log_type ON public.pos_action_log(action_type);

-- ─── RLS ──────────────────────────────────────────────────────────────────────
ALTER TABLE public.pos_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pos_action_log ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'pos_sessions' AND policyname = 'pos_sessions_open') THEN
    CREATE POLICY pos_sessions_open ON public.pos_sessions FOR ALL USING (true) WITH CHECK (true);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'pos_action_log' AND policyname = 'pos_action_log_open') THEN
    CREATE POLICY pos_action_log_open ON public.pos_action_log FOR ALL USING (true) WITH CHECK (true);
  END IF;
END $$;
