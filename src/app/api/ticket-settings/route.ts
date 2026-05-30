import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

function makeClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!url) throw new Error('NEXT_PUBLIC_SUPABASE_URL not set');
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!key) throw new Error('No Supabase key configured');
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    console.warn('[api/ticket-settings] SUPABASE_SERVICE_ROLE_KEY missing — using anon key');
  }
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}

const DEFAULTS = {
  header_text:
    "LE MONDE DE L'ESTHETIQUE\nBaie des Flamands Appt 306 9 avenue Loulou Boislaville\n97200 Fort-de-France\nTVA : FR71 927747 725",
  footer_text: "Conservez ce ticket pour tout échange.\nRCS Fort-de-France 927 747 725",
  thank_you_message: 'Merci et à très bientôt !',
  paper_width: '80mm',
  font_size: 'medium',
  show_logo: true,
  show_tva_detail: true,
  show_barcode: true,
  show_loyalty_points: true,
  show_next_tier: true,
};

// ─── GET /api/ticket-settings ─────────────────────────────────────────────────
export async function GET() {
  let supabase;
  try { supabase = makeClient(); } catch {
    return NextResponse.json(DEFAULTS);
  }
  try {
    const { data, error } = await supabase
      .from('ticket_settings')
      .select('*')
      .eq('id', 1)
      .maybeSingle();
    if (error) throw error;
    return NextResponse.json(data ?? DEFAULTS);
  } catch {
    return NextResponse.json(DEFAULTS);
  }
}

// ─── POST /api/ticket-settings ────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: 'Corps de requête invalide (JSON attendu)' }, { status: 400 });
  }

  let supabase;
  try {
    supabase = makeClient();
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error('[api/ticket-settings POST] client init:', msg);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }

  const payload = {
    id: 1,
    header_text:         body.header_text         ?? DEFAULTS.header_text,
    footer_text:         body.footer_text         ?? DEFAULTS.footer_text,
    thank_you_message:   body.thank_you_message   ?? DEFAULTS.thank_you_message,
    paper_width:         body.paper_width         ?? DEFAULTS.paper_width,
    font_size:           body.font_size           ?? DEFAULTS.font_size,
    show_logo:           body.show_logo           ?? DEFAULTS.show_logo,
    show_tva_detail:     body.show_tva_detail     ?? DEFAULTS.show_tva_detail,
    show_barcode:        body.show_barcode        ?? DEFAULTS.show_barcode,
    show_loyalty_points: body.show_loyalty_points ?? DEFAULTS.show_loyalty_points,
    show_next_tier:      body.show_next_tier      ?? DEFAULTS.show_next_tier,
    updated_at:          new Date().toISOString(),
  };

  console.log('[api/ticket-settings POST] upserting:', JSON.stringify(payload));

  const { error } = await supabase
    .from('ticket_settings')
    .upsert(payload, { onConflict: 'id' });

  if (error) {
    console.error('[api/ticket-settings POST] upsert error code:', error.code, 'message:', error.message);
    if (error.code === '42P01') {
      return NextResponse.json(
        {
          ok: false,
          error: 'La table ticket_settings n\'existe pas. Exécutez cette migration dans Supabase SQL Editor :',
          sql: SETUP_SQL,
          code: error.code,
        },
        { status: 500 }
      );
    }
    return NextResponse.json({ ok: false, error: error.message, code: error.code }, { status: 500 });
  }

  console.log('[api/ticket-settings POST] saved OK');
  return NextResponse.json({ ok: true });
}

const SETUP_SQL = `
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
  updated_at          TIMESTAMPTZ DEFAULT now(),
  CONSTRAINT single_row CHECK (id = 1)
);
ALTER TABLE public.ticket_settings ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='ticket_settings' AND policyname='allow_all_ticket_settings') THEN
    CREATE POLICY allow_all_ticket_settings ON public.ticket_settings FOR ALL USING (true) WITH CHECK (true);
  END IF;
END $$;
INSERT INTO public.ticket_settings (id) VALUES (1) ON CONFLICT (id) DO NOTHING;
`.trim();
