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

export async function GET(req: NextRequest) {
  if (!isSessionValid(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

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

export async function POST(req: NextRequest) {
  if (!isSessionValid(req)) {
    console.error('[api/ticket-settings POST] session invalid');
    return NextResponse.json({ ok: false, error: 'Session expirée — rechargez la page' }, { status: 401 });
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: 'Corps de requête invalide' }, { status: 400 });
  }

  let supabase;
  try {
    supabase = makeClient();
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error('[api/ticket-settings POST] client init failed:', msg);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }

  console.log('[api/ticket-settings POST] upserting row id=1');
  const { error } = await supabase
    .from('ticket_settings')
    .upsert({ id: 1, ...body, updated_at: new Date().toISOString() }, { onConflict: 'id' });

  if (error) {
    console.error('[api/ticket-settings POST] upsert error:', error.code, error.message);
    const hint = error.code === '42P01'
      ? ' — la table ticket_settings n\'existe pas, exécutez la migration SQL'
      : '';
    return NextResponse.json({ ok: false, error: error.message + hint, code: error.code }, { status: 500 });
  }

  console.log('[api/ticket-settings POST] saved OK');
  return NextResponse.json({ ok: true });
}
