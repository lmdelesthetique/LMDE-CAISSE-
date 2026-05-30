import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const SESSION_COOKIE = 'app_session';

function isSessionValid(req: NextRequest): boolean {
  const value = req.cookies.get(SESSION_COOKIE)?.value;
  if (!value) return false;
  try {
    const { exp } = JSON.parse(atob(value)) as { exp: number };
    return Date.now() < exp;
  } catch {
    return false;
  }
}

export async function GET(req: NextRequest) {
  const sessionOk = isSessionValid(req);
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '';

  const result: Record<string, unknown> = {
    session_valid: sessionOk,
    supabase_url_set: !!url,
    service_key_set: !!serviceKey,
    service_key_prefix: serviceKey ? serviceKey.substring(0, 20) + '…' : null,
    anon_key_set: !!anonKey,
    tables: {} as Record<string, unknown>,
    errors: [] as string[],
  };

  const errors = result.errors as string[];

  if (!sessionOk) errors.push('session_invalid: session cookie missing or expired');
  if (!url) errors.push('env_missing: NEXT_PUBLIC_SUPABASE_URL not set');
  if (!serviceKey) errors.push('env_missing: SUPABASE_SERVICE_ROLE_KEY not set — using anon key fallback');

  const key = serviceKey || anonKey;
  if (!key || !url) {
    return NextResponse.json({ ...result, ok: false });
  }

  const supabase = createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // Test each required table
  const tables = ['receipts', 'ticket_modifications', 'ticket_settings'];
  const tableResults = result.tables as Record<string, unknown>;

  for (const table of tables) {
    const { data, error } = await supabase.from(table).select('id').limit(1);
    if (error) {
      tableResults[table] = { exists: false, error: error.message, code: error.code };
      errors.push(`table_missing: ${table} — ${error.message} (${error.code})`);
    } else {
      tableResults[table] = { exists: true, rows_sample: data?.length ?? 0 };
    }
  }

  // Test receipts columns specifically
  if (tableResults['receipts'] && (tableResults['receipts'] as any).exists) {
    const { error: colError } = await supabase
      .from('receipts')
      .select('id, ticket_number, created_at, total_amount, payment_method, client_id, client_name, items_count, status, cashier_name, discount_amount, subtotal_ht, total_tva, payment_type, loyalty_points_earned, loyalty_reward_used')
      .limit(0);

    if (colError) {
      errors.push(`columns_missing: receipts — ${colError.message}`);
      tableResults['receipts_columns'] = { ok: false, error: colError.message };
    } else {
      tableResults['receipts_columns'] = { ok: true };
    }
  }

  return NextResponse.json({
    ...result,
    ok: errors.length === 0,
    setup_sql: errors.some(e => e.includes('table_missing') || e.includes('columns_missing'))
      ? SETUP_SQL
      : null,
  });
}

const SETUP_SQL = `
-- ============================================================
-- BeautyPOS — Complete DB Setup (run in Supabase SQL Editor)
-- ============================================================

-- 1. Receipts table (create if not exists)
CREATE TABLE IF NOT EXISTS public.receipts (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_number   TEXT,
  client_id       UUID REFERENCES public.clients(id) ON DELETE SET NULL,
  client_name     TEXT,
  cashier_name    TEXT,
  items           JSONB DEFAULT '[]'::jsonb,
  items_count     INTEGER DEFAULT 0,
  subtotal_ht     NUMERIC(12,2) DEFAULT 0,
  total_tva       NUMERIC(12,2) DEFAULT 0,
  total_amount    NUMERIC(12,2) NOT NULL DEFAULT 0,
  discount_amount NUMERIC(12,2) DEFAULT 0,
  payment_method  TEXT DEFAULT 'other',
  payment_type    TEXT DEFAULT 'sale',
  status          TEXT NOT NULL DEFAULT 'completed',
  notes           TEXT,
  loyalty_points_earned INTEGER DEFAULT 0,
  loyalty_reward_used   TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. Add any missing columns to existing receipts table
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='receipts' AND column_name='subtotal_ht') THEN
    ALTER TABLE public.receipts ADD COLUMN subtotal_ht NUMERIC(12,2) DEFAULT 0;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='receipts' AND column_name='total_tva') THEN
    ALTER TABLE public.receipts ADD COLUMN total_tva NUMERIC(12,2) DEFAULT 0;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='receipts' AND column_name='payment_type') THEN
    ALTER TABLE public.receipts ADD COLUMN payment_type TEXT DEFAULT 'sale';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='receipts' AND column_name='loyalty_points_earned') THEN
    ALTER TABLE public.receipts ADD COLUMN loyalty_points_earned INTEGER DEFAULT 0;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='receipts' AND column_name='loyalty_reward_used') THEN
    ALTER TABLE public.receipts ADD COLUMN loyalty_reward_used TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='receipts' AND column_name='cashier_name') THEN
    ALTER TABLE public.receipts ADD COLUMN cashier_name TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='receipts' AND column_name='client_name') THEN
    ALTER TABLE public.receipts ADD COLUMN client_name TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='receipts' AND column_name='items_count') THEN
    ALTER TABLE public.receipts ADD COLUMN items_count INTEGER DEFAULT 0;
  END IF;
END $$;

-- 3. RLS for receipts (allow all — server uses service role anyway)
ALTER TABLE public.receipts ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='receipts' AND policyname='allow_all_receipts') THEN
    CREATE POLICY allow_all_receipts ON public.receipts FOR ALL USING (true) WITH CHECK (true);
  END IF;
END $$;

-- 4. Ticket modifications audit table
CREATE TABLE IF NOT EXISTS public.ticket_modifications (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  receipt_id   UUID NOT NULL REFERENCES public.receipts(id) ON DELETE CASCADE,
  modified_by  TEXT NOT NULL,
  modified_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  field_changed TEXT NOT NULL,
  old_value    TEXT,
  new_value    TEXT,
  reason       TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.ticket_modifications ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='ticket_modifications' AND policyname='allow_all_ticket_modifications') THEN
    CREATE POLICY allow_all_ticket_modifications ON public.ticket_modifications FOR ALL USING (true) WITH CHECK (true);
  END IF;
END $$;

-- 5. Ticket settings table
CREATE TABLE IF NOT EXISTS public.ticket_settings (
  id                  INT PRIMARY KEY DEFAULT 1,
  header_text         TEXT,
  footer_text         TEXT,
  thank_you_message   TEXT,
  paper_width         TEXT DEFAULT '80mm',
  font_size           TEXT DEFAULT 'medium',
  show_logo           BOOLEAN DEFAULT true,
  show_tva_detail     BOOLEAN DEFAULT true,
  show_barcode        BOOLEAN DEFAULT true,
  show_loyalty_points BOOLEAN DEFAULT true,
  show_next_tier      BOOLEAN DEFAULT true,
  updated_at          TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE public.ticket_settings ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='ticket_settings' AND policyname='allow_all_ticket_settings') THEN
    CREATE POLICY allow_all_ticket_settings ON public.ticket_settings FOR ALL USING (true) WITH CHECK (true);
  END IF;
END $$;

-- 6. Indexes
CREATE INDEX IF NOT EXISTS idx_receipts_created_at ON public.receipts(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_receipts_payment_method ON public.receipts(payment_method);
CREATE INDEX IF NOT EXISTS idx_receipts_status ON public.receipts(status);
CREATE INDEX IF NOT EXISTS idx_ticket_modifications_receipt ON public.ticket_modifications(receipt_id);
`.trim();
