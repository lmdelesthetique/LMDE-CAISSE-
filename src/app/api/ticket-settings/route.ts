import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

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

  const supabase = createAdminClient();
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
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const supabase = createAdminClient();
  const { error } = await supabase
    .from('ticket_settings')
    .upsert({ id: 1, ...body, updated_at: new Date().toISOString() });

  if (error) {
    console.error('[api/ticket-settings POST]', error);
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
